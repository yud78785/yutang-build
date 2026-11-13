package main

import (
	"fmt"
	"strconv"
)

func parseOwnerPID(args []string, parentPID int) (uint32, error) {
	if len(args) != 2 || args[0] != "--owner-pid" {
		return 0, fmt.Errorf("expected exactly --owner-pid <pid>")
	}
	value, err := strconv.ParseUint(args[1], 10, 32)
	if err != nil || value == 0 {
		return 0, fmt.Errorf("owner PID must be a positive uint32")
	}
	if parentPID <= 0 || uint64(parentPID) != value {
		return 0, fmt.Errorf("owner PID must equal this helper's immediate parent PID")
	}
	return uint32(value), nil
}
