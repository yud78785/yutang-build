//go:build windows

package main

import (
    "fmt"
    "syscall"
    "unsafe"
)

// Confirm that a worker is the direct child of this desktop process before
// allowing a guard to assign the worker to its own Windows Job Object.
func immediateParentOfPID(pid uint32) (uint32, error) {
    snapshot, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
    if err != nil { return 0, fmt.Errorf("CreateToolhelp32Snapshot: %w",err) }
    defer syscall.CloseHandle(snapshot)
    var entry syscall.ProcessEntry32
    entry.Size = uint32(unsafe.Sizeof(entry))
    err = syscall.Process32First(snapshot,&entry)
    for err==nil {
        if entry.ProcessID==pid { return entry.ParentProcessID,nil }
        err=syscall.Process32Next(snapshot,&entry)
    }
    return 0,fmt.Errorf("target worker PID not found in process snapshot")
}
