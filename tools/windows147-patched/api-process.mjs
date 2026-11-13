import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

export class ApiProcess {
  constructor(node, runtime, { env = process.env, timeoutMs = 30_000 } = {}) {
    Object.assign(this, { node, runtime, env, timeoutMs });
    this.pending = new Map(); this.secrets = new Set(); this.stderr = ''; this.desktopGuard = null;
  }
  safe(value) {
    let result = String(value).replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [凭据已隐藏]');
    for (const key of this.secrets) result = result.split(key).join('[凭据已隐藏]');
    return result.slice(-12000);
  }
  request(type, extra = {}, timeoutMs = this.timeoutMs) {
    if (extra.config?.apiKey) this.secrets.add(extra.config.apiKey);
    if (extra.options?.config?.apiKey) this.secrets.add(extra.options.config.apiKey);
    if (!this.child?.connected) return Promise.reject(new Error('软件后台没有连接。'));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('软件后台操作超时。')); }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.child.send({ type, requestId, ...extra }, error => {
        if (!error) return;
        const pending = this.pending.get(requestId); if (!pending) return;
        clearTimeout(timer); this.pending.delete(requestId); reject(new Error(this.safe(error.message)));
      });
    });
  }
  async start(config, { htmlFile, staticRoot } = {}) {
    if (this.child) throw new Error('软件后台已经启动。');
    const env = { ...this.env };
    for (const key of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL']) delete env[key];
    this.child = spawn(this.node, [path.join(this.runtime, 'api-worker.mjs')], { cwd: this.runtime, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    this.child.stdout.resume();
    this.child.stderr.on('data', data => { this.stderr = this.safe(this.stderr + data.toString('utf8')); });
    this.exited = new Promise(resolve => {
      let finished = false;
      const finish = (code, signal) => {
        if (finished) return; finished = true;
        this.exitCode = code; this.exitSignal = signal;
        for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(`软件后台已退出（${code ?? signal}）。${this.stderr}`)); }
        this.pending.clear(); resolve();
      };
      this.child.once('exit', finish);
      this.child.once('close', finish);
      this.child.once('error', () => finish(null, 'spawn-error'));
    });
    this.child.on('error', error => {
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(this.safe(error.message))); }
      this.pending.clear();
    });
    this.child.on('message', message => {
      if (message?.type !== 'response' || typeof message.requestId !== 'string') return;
      const pending = this.pending.get(message.requestId); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.requestId);
      if (message.ok === true) pending.resolve(message.result);
      else pending.reject(new Error(this.safe(message.error || '软件后台操作失败。')));
    });
    if (process.platform === 'win32') {
      try { await this.attachDesktopJobGuard(); }
      catch (error) { try { this.child.kill('SIGKILL'); } catch {} throw error; }
    }
    try {
      const result = await this.request('start', { options: { config, domainRoot: this.runtime, htmlFile: htmlFile || path.join(this.runtime, 'public', 'index.html'), staticRoot: staticRoot || path.join(this.runtime, 'public') } });
      if (!Number.isSafeInteger(result.port) || result.port < 1024 || result.port > 65535) throw new Error('软件后台返回了无效端口。');
      this.origin = `http://127.0.0.1:${result.port}`; return result;
    } catch (error) { await this.stop().catch(() => {}); throw error; }
  }
  async attachDesktopJobGuard() {
    const guardFile=path.join(this.runtime,'jobguard.exe');
    const stat=await fs.lstat(guardFile);
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Windows API worker guard must be a real packaged file.');
    const workerPid=Number(this.child?.pid);
    if(!Number.isSafeInteger(workerPid)||workerPid<=0)throw new Error('Windows API worker PID is not available.');
    const expected='READY '+String(process.pid)+' '+String(workerPid);
    const guard=spawn(guardFile,['--owner-pid',String(process.pid),'--target-pid',String(workerPid)],{shell:false,windowsHide:true,stdio:['ignore','pipe','ignore']});
    this.desktopGuard=guard;
    await new Promise((resolve,reject)=>{
      let settled=false,buffer='';
      const fail=error=>{if(settled)return;settled=true;clearTimeout(timer);try{guard.kill();}catch{}reject(new Error('Windows API worker Job Object containment was not confirmed; backend start refused.',{cause:error}));};
      const timer=setTimeout(()=>fail(new Error('Desktop Job Object readiness timeout')),5000);
      guard.once('error',fail);
      guard.once('exit',code=>{if(!settled)fail(new Error('Desktop Job Object guard exited before ready: '+String(code)));});
      guard.stdout.setEncoding('utf8');
      guard.stdout.on('data',chunk=>{
        if(settled)return;buffer+=chunk;
        if(buffer.length>256)return fail(new Error('Desktop Job Object handshake too large'));
        const newline=buffer.indexOf('\n');if(newline<0)return;
        const line=buffer.slice(0,newline).trim();
        if(line!==expected)return fail(new Error('Desktop Job Object returned invalid PID handshake'));
        settled=true;clearTimeout(timer);
        guard.once('exit',()=>{if(!this.stopping&&this.child&&this.child.exitCode===null&&this.child.signalCode===null)try{this.child.kill('SIGKILL');}catch{}});
        resolve();
      });
    });
  }
  configure(config) { return this.request('configure', { config }); }
  getConfig() { return this.request('get-config'); }
  stop() { return this.stopping ??= this.stopOnce(); }
  async stopOnce() {
    if (!this.child) return;
    if (this.child.connected) { try { await this.request('stop', {}, 8000); } catch {} }
    const wait = milliseconds => new Promise(resolve => { const timer = setTimeout(() => resolve(false), milliseconds); this.exited.then(() => { clearTimeout(timer); resolve(true); }); });
    if (!await wait(1000)) this.child.kill('SIGTERM');
    if (!await wait(5000)) { this.child.kill('SIGKILL'); if (!await wait(2000)) throw new Error('软件后台未能退出。'); }
    try { if (this.desktopGuard && this.desktopGuard.exitCode===null) this.desktopGuard.kill(); } catch {}
    this.desktopGuard=null;
    this.secrets.clear();
  }
}
