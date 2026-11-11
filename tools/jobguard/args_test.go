package main

import "testing"

func TestParseOwnerPIDRequiresExactImmediateParent(t *testing.T) {
	tests := []struct {
		name      string
		args      []string
		parentPID int
		want      uint32
		wantErr   bool
	}{
		{name: "valid", args: []string{"--owner-pid", "1234"}, parentPID: 1234, want: 1234},
		{name: "wrong parent", args: []string{"--owner-pid", "1234"}, parentPID: 1235, wantErr: true},
		{name: "zero", args: []string{"--owner-pid", "0"}, parentPID: 0, wantErr: true},
		{name: "overflow", args: []string{"--owner-pid", "4294967296"}, parentPID: 1, wantErr: true},
		{name: "extra argument", args: []string{"--owner-pid", "1234", "other"}, parentPID: 1234, wantErr: true},
		{name: "missing flag", args: []string{"1234"}, parentPID: 1234, wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := parseOwnerPID(test.args, test.parentPID)
			if (err != nil) != test.wantErr {
				t.Fatalf("parseOwnerPID() error = %v, wantErr %v", err, test.wantErr)
			}
			if err == nil && got != test.want {
				t.Fatalf("parseOwnerPID() = %d, want %d", got, test.want)
			}
		})
	}
}
