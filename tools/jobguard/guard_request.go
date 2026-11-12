package main

import (
    "fmt"
    "strconv"
)

type guardRequest struct {
    ownerPID uint32
    targetPID uint32
}

func parseGuardRequest(args []string, immediateParentPID int) (guardRequest, error) {
    if len(args) != 2 && len(args) != 4 {
        return guardRequest{}, fmt.Errorf("expected --owner-pid <pid> [--target-pid <direct-child-pid>]")
    }
    ownerPID, err := parseOwnerPID(args[:2], immediateParentPID)
    if err != nil { return guardRequest{}, err }
    if len(args) == 2 { return guardRequest{ownerPID:ownerPID, targetPID:ownerPID}, nil }
    if args[2] != "--target-pid" {
        return guardRequest{}, fmt.Errorf("expected --target-pid after --owner-pid")
    }
    parsed, err := strconv.ParseUint(args[3], 10, 32)
    if err != nil || parsed == 0 || parsed == uint64(ownerPID) {
        return guardRequest{}, fmt.Errorf("target PID must be a distinct positive uint32")
    }
    return guardRequest{ownerPID:ownerPID, targetPID:uint32(parsed)}, nil
}

 
// openVerifiedTargetProcess pins the process object before checking its parent.
// Holding the handle prevents PID reuse between the ancestry check and job assignment.
func openVerifiedTargetProcess(
	ownerPID, targetPID uint32,
	openProcess func(uint32) (uintptr, error),
	parentOf func(uint32) (uint32, error),
	closeHandle func(uintptr),
) (uintptr, error) {
	if ownerPID == 0 || targetPID == 0 || targetPID == ownerPID {
		return 0, fmt.Errorf("target PID must be distinct and positive")
	}
	handle, err := openProcess(targetPID)
	if err != nil {
		return 0, fmt.Errorf("open target process: %w", err)
	}
	if handle == 0 {
		return 0, fmt.Errorf("open target process returned a null handle")
	}
	parentPID, err := parentOf(targetPID)
	if err != nil {
		closeHandle(handle)
		return 0, fmt.Errorf("verify worker ancestry: %w", err)
	}
	if parentPID != ownerPID {
		closeHandle(handle)
		return 0, fmt.Errorf("refusing worker target: immediate parent is not desktop owner")
	}
	return handle, nil
}
