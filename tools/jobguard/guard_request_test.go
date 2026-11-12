package main

import (
	"errors"
	"testing"
)

func TestParseGuardRequestBothModes(t *testing.T) {
    tests := []struct {
        name string
        args []string
        parent int
        owner uint32
        target uint32
        reject bool
    }{
        {"old browser owner", []string{"--owner-pid","101"},101,101,101,false},
        {"desktop targets worker", []string{"--owner-pid","101","--target-pid","202"},101,101,202,false},
        {"wrong immediate parent", []string{"--owner-pid","101","--target-pid","202"},999,0,0,true},
        {"same target", []string{"--owner-pid","101","--target-pid","101"},101,0,0,true},
        {"zero target", []string{"--owner-pid","101","--target-pid","0"},101,0,0,true},
        {"overflow target", []string{"--owner-pid","101","--target-pid","4294967296"},101,0,0,true},
        {"missing target", []string{"--owner-pid","101","--target-pid"},101,0,0,true},
        {"wrong flag", []string{"--owner-pid","101","--other","202"},101,0,0,true},
        {"trailing args", []string{"--owner-pid","101","--target-pid","202","extra"},101,0,0,true},
    }
    for _, tc := range tests {
        t.Run(tc.name,func(t *testing.T) {
            got,err:=parseGuardRequest(tc.args,tc.parent)
            if (err!=nil)!=tc.reject {t.Fatalf("error=%v reject=%v",err,tc.reject)}
            if err==nil && (got.ownerPID!=tc.owner||got.targetPID!=tc.target){
                t.Fatalf("guard request = %+v, expected owner=%d target=%d",got,tc.owner,tc.target)
            }
        })
    }
}

 
func TestOpenVerifiedTargetPinsHandleBeforeParentCheck(t *testing.T) {
	var calls []string
	handle, err := openVerifiedTargetProcess(101, 202,
		func(pid uint32) (uintptr, error) {
			calls = append(calls, "open")
			if pid != 202 { t.Fatalf("opened PID %d, want 202", pid) }
			return 77, nil
		},
		func(pid uint32) (uint32, error) {
			calls = append(calls, "parent")
			if pid != 202 { t.Fatalf("checked PID %d, want 202", pid) }
			return 101, nil
		},
		func(handle uintptr) { calls = append(calls, "close") },
	)
	if err != nil { t.Fatalf("openVerifiedTargetProcess: %v", err) }
	if handle != 77 { t.Fatalf("handle = %d, want 77", handle) }
	if len(calls) != 2 || calls[0] != "open" || calls[1] != "parent" {
		t.Fatalf("call order = %v, want [open parent]", calls)
	}
}

func TestOpenVerifiedTargetClosesHandleWhenParentDoesNotMatch(t *testing.T) {
	closed := false
	_, err := openVerifiedTargetProcess(101, 202,
		func(uint32) (uintptr, error) { return 77, nil },
		func(uint32) (uint32, error) { return 999, nil },
		func(handle uintptr) { closed = handle == 77 },
	)
	if err == nil { t.Fatal("expected parent mismatch to fail closed") }
	if !closed { t.Fatal("target process handle was not closed after parent mismatch") }
}

func TestOpenVerifiedTargetClosesHandleWhenParentLookupFails(t *testing.T) {
	closed := false
	_, err := openVerifiedTargetProcess(101, 202,
		func(uint32) (uintptr, error) { return 77, nil },
		func(uint32) (uint32, error) { return 0, errors.New("synthetic snapshot failure") },
		func(handle uintptr) { closed = handle == 77 },
	)
	if err == nil { t.Fatal("expected parent lookup failure") }
	if !closed { t.Fatal("target process handle was not closed after parent lookup failure") }
}

func TestOpenVerifiedTargetDoesNotCheckParentWhenOpenFails(t *testing.T) {
	parentChecked := false
	_, err := openVerifiedTargetProcess(101, 202,
		func(uint32) (uintptr, error) { return 0, errors.New("synthetic OpenProcess failure") },
		func(uint32) (uint32, error) { parentChecked = true; return 101, nil },
		func(uintptr) { t.Fatal("close called without a process handle") },
	)
	if err == nil { t.Fatal("expected OpenProcess failure") }
	if parentChecked { t.Fatal("parent lookup ran without a pinned process handle") }
}

func TestOpenVerifiedTargetRejectsOwnerPIDBeforeOpening(t *testing.T) {
	opened := false
	_, err := openVerifiedTargetProcess(101, 101,
		func(uint32) (uintptr, error) { opened = true; return 77, nil },
		func(uint32) (uint32, error) { return 101, nil },
		func(uintptr) {},
	)
	if err == nil { t.Fatal("expected same owner/target PID to be rejected") }
	if opened { t.Fatal("same PID was opened before validation") }
}
