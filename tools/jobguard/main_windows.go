//go:build windows

package main

import (
	"fmt"
	"os"
	"syscall"
	"unsafe"
)

const (
	processTerminate              = 0x0001
	processSetQuota                = 0x0100
	synchronize                    = 0x00100000
	jobObjectExtendedLimitInfo     = 9
	jobObjectLimitKillOnJobClose   = 0x00002000
	waitObject0                    = 0x00000000
	waitTimeout                    = 0x00000102
	waitFailed                     = 0xFFFFFFFF
	infinite                       = 0xFFFFFFFF
)

type jobBasicLimitInformation struct {
	PerProcessUserTimeLimit int64
	PerJobUserTimeLimit     int64
	LimitFlags              uint32
	MinimumWorkingSetSize   uintptr
	MaximumWorkingSetSize   uintptr
	ActiveProcessLimit      uint32
	Affinity                uintptr
	PriorityClass           uint32
	SchedulingClass         uint32
}

type ioCounters struct {
	ReadOperationCount  uint64
	WriteOperationCount uint64
	OtherOperationCount uint64
	ReadTransferCount   uint64
	WriteTransferCount  uint64
	OtherTransferCount  uint64
}

type jobExtendedLimitInformation struct {
	BasicLimitInformation jobBasicLimitInformation
	IoInfo                ioCounters
	ProcessMemoryLimit    uintptr
	JobMemoryLimit        uintptr
	PeakProcessMemoryUsed uintptr
	PeakJobMemoryUsed     uintptr
}

var (
	kernel32                 = syscall.NewLazyDLL("kernel32.dll")
	procCreateJobObjectW     = kernel32.NewProc("CreateJobObjectW")
	procSetInformationJob    = kernel32.NewProc("SetInformationJobObject")
	procOpenProcess          = kernel32.NewProc("OpenProcess")
	procAssignProcessToJob   = kernel32.NewProc("AssignProcessToJobObject")
	procWaitForSingleObject  = kernel32.NewProc("WaitForSingleObject")
	procCloseHandle          = kernel32.NewProc("CloseHandle")
)

func win32Error(name string, callErr error) error {
	if callErr == nil || callErr == syscall.Errno(0) {
		return fmt.Errorf("%s failed without a Win32 error code", name)
	}
	return fmt.Errorf("%s: %w", name, callErr)
}

func runGuard() error {
	request, err := parseGuardRequest(os.Args[1:], os.Getppid())
	if err != nil {
		return fmt.Errorf("invalid guard request: %w", err)
	}
	ownerPID := request.ownerPID

	ownerRights := uintptr(synchronize)
	if request.targetPID == ownerPID {
		ownerRights = uintptr(processTerminate|processSetQuota|synchronize)
	}
	owner, _, callErr := procOpenProcess.Call(ownerRights, 0, uintptr(ownerPID))
	if owner == 0 {
		return win32Error("OpenProcess(owner)", callErr)
	}
	defer procCloseHandle.Call(owner)

	// For the desktop mode, guard the API worker instead of Electron itself.
	// The updater is an Electron child, and must not be dragged into this job.
	target := owner
	if request.targetPID != ownerPID {
		targetHandle, err := openVerifiedTargetProcess(
			ownerPID,
			request.targetPID,
			func(pid uint32) (uintptr, error) {
				handle, _, openErr := procOpenProcess.Call(
					uintptr(processTerminate|processSetQuota|synchronize), 0, uintptr(pid),
				)
				if handle == 0 {
					return 0, win32Error("OpenProcess(target worker)", openErr)
				}
				return handle, nil
			},
			immediateParentOfPID,
			func(handle uintptr) { procCloseHandle.Call(handle) },
		)
		if err != nil {
			return err
		}
		target = targetHandle
		defer procCloseHandle.Call(target)
	}

	job, _, callErr := procCreateJobObjectW.Call(0, 0)
	if job == 0 {
		return win32Error("CreateJobObjectW", callErr)
	}
	defer procCloseHandle.Call(job)

	info := jobExtendedLimitInformation{}
	info.BasicLimitInformation.LimitFlags = jobObjectLimitKillOnJobClose
	ok, _, callErr := procSetInformationJob.Call(
		job,
		jobObjectExtendedLimitInfo,
		uintptr(unsafe.Pointer(&info)),
		unsafe.Sizeof(info),
	)
	if ok == 0 {
		return win32Error("SetInformationJobObject", callErr)
	}

	ok, _, callErr = procAssignProcessToJob.Call(job, target)
	if ok == 0 {
		return win32Error("AssignProcessToJobObject", callErr)
	}

	state, _, callErr := procWaitForSingleObject.Call(owner, 0)
	if state == waitObject0 {
		return fmt.Errorf("owner exited before the guard became ready")
	}
	if state != waitTimeout {
		if state == waitFailed {
			return win32Error("WaitForSingleObject(owner, 0)", callErr)
		}
		return fmt.Errorf("unexpected owner wait state: 0x%08x", uint32(state))
	}

	if request.targetPID != ownerPID {
		state, _, callErr = procWaitForSingleObject.Call(target, 0)
		if state == waitObject0 {
			return fmt.Errorf("target worker exited before the guard became ready")
		}
		if state != waitTimeout {
			if state == waitFailed { return win32Error("WaitForSingleObject(target, 0)",callErr) }
			return fmt.Errorf("unexpected worker wait state: 0x%08x", uint32(state))
		}
	}
	var handshake string
	if request.targetPID != ownerPID {
		handshake = fmt.Sprintf("READY %d %d\n",ownerPID,request.targetPID)
	} else {
		handshake = fmt.Sprintf("READY %d\n", ownerPID)
	}
	if _, err := fmt.Fprint(os.Stdout, handshake); err != nil {
		return fmt.Errorf("write readiness handshake: %w", err)
	}
	for {
		// Close the job when either the desktop owner exits or its guarded worker exits.
		// This prevents a crashed API worker from leaving its Edge descendants alive.
		state, _, callErr = procWaitForSingleObject.Call(owner, 500)
		if state == waitObject0 { break }
		if state == waitFailed { return win32Error("WaitForSingleObject(owner, 500)", callErr) }
		if state != waitTimeout { return fmt.Errorf("unexpected owner wait state: 0x%08x", uint32(state)) }
		if request.targetPID != ownerPID {
			state, _, callErr = procWaitForSingleObject.Call(target, 0)
			if state == waitObject0 { break }
			if state == waitFailed { return win32Error("WaitForSingleObject(target, 0)", callErr) }
			if state != waitTimeout { return fmt.Errorf("unexpected worker wait state: 0x%08x", uint32(state)) }
		}
	}

	// Closing the only job handle activates KILL_ON_JOB_CLOSE. For the desktop
	// mode, it terminates the API worker and all its children (including Edge).
	// For browser-host mode, it terminates Edge descendants.
	return nil
}

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "--shortcut-commit", "--shortcut-restore", "--shortcut-delete":
			if err := runShortcutOperation(os.Args[1:], os.Getppid()); err != nil {
				_, _ = fmt.Fprintln(os.Stdout, "ERROR SHORTCUT_OPERATION_FAILED")
				_, _ = fmt.Fprintln(os.Stderr, "YuTang shortcut operation failed:", err)
				os.Exit(2)
			}
			_, _ = fmt.Fprintln(os.Stdout, "SHORTCUT_OPERATION_OK", os.Args[1])
			return
		}
	}
	if err := runGuard(); err != nil {
		_, _ = fmt.Fprintf(os.Stdout, "ERROR JOB_GUARD_FAILED\n")
		_, _ = fmt.Fprintln(os.Stderr, "YuTang Job Object guard failed:", err)
		os.Exit(2)
	}
}
