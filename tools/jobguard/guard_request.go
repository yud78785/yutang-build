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
