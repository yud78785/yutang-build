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
	ownerPID, err := parseOwnerPID(os.Args[1:], os.Getppid())
	if err != nil {
		return fmt.Errorf("invalid owner: %w", err)
	}

	owner, _, callErr := procOpenProcess.Call(
		uintptr(processTerminate|processSetQuota|synchronize),
		0,
		uintptr(ownerPID),
	)
	if owner == 0 {
		return win32Error("OpenProcess", callErr)
	}
	defer procCloseHandle.Call(owner)

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

	ok, _, callErr = procAssignProcessToJob.Call(job, owner)
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

	if _, err := fmt.Fprintf(os.Stdout, "READY %d\n", ownerPID); err != nil {
		return fmt.Errorf("write readiness handshake: %w", err)
	}
	if err := os.Stdout.Sync(); err != nil {
		return fmt.Errorf("flush readiness handshake: %w", err)
	}

	state, _, callErr = procWaitForSingleObject.Call(owner, infinite)
	if state != waitObject0 {
		if state == waitFailed {
			return win32Error("WaitForSingleObject(owner, INFINITE)", callErr)
		}
		return fmt.Errorf("unexpected owner exit wait state: 0x%08x", uint32(state))
	}

	// Closing the only job handle activates KILL_ON_JOB_CLOSE. Any Edge
	// descendants still alive after the host exits are terminated by Windows.
	return nil
}

func main() {
	if err := runGuard(); err != nil {
		_, _ = fmt.Fprintf(os.Stdout, "ERROR JOB_GUARD_FAILED\n")
		_, _ = fmt.Fprintln(os.Stderr, "YuTang Job Object guard failed:", err)
		os.Exit(2)
	}
}
