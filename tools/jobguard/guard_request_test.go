package main

import "testing"

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
