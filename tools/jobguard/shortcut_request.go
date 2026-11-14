package main

import (
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
)

type shortcutOperationRequest struct {
	operation string
	ownerPID  uint32
	shortcut  string
	backup    string
	temporary string
	quarantine string
	path      string
	oldSHA256 string
	newSHA256 string
	sha256    string
}

func validShortcutRequestHash(value string) bool {
	if len(value) != 64 { return false }
	_, err := hex.DecodeString(value)
	return err == nil
}

func validShortcutRequestPath(value string) bool {
	return value != "" &&
		filepath.IsAbs(value) &&
		filepath.Clean(value) == value &&
		strings.EqualFold(filepath.Ext(value), ".lnk")
}

func parseShortcutOperationRequest(args []string, immediateParentPID int) (shortcutOperationRequest, error) {
	var request shortcutOperationRequest
	if len(args) < 3 || len(args)%2 != 1 {
		return request, fmt.Errorf("expected operation followed by flag/value pairs")
	}
	switch args[0] {
	case "--shortcut-commit", "--shortcut-restore", "--shortcut-delete":
		request.operation = args[0]
	default:
		return request, fmt.Errorf("unsupported shortcut operation")
	}
	values := make(map[string]string, (len(args)-1)/2)
	for i := 1; i < len(args); i += 2 {
		key, value := args[i], args[i+1]
		if !strings.HasPrefix(key, "--") || len(key) < 3 || value == "" {
			return request, fmt.Errorf("invalid shortcut operation argument")
		}
		if _, exists := values[key]; exists {
			return request, fmt.Errorf("duplicate shortcut operation argument: %s", key)
		}
		values[key] = value
	}
	ownerText, ok := values["--owner-pid"]
	if !ok { return request, fmt.Errorf("owner PID is required") }
	owner, err := strconv.ParseUint(ownerText, 10, 32)
	if err != nil || owner == 0 || immediateParentPID <= 0 || owner != uint64(immediateParentPID) {
		return request, fmt.Errorf("owner PID must equal this helper's immediate parent PID")
	}
	request.ownerPID = uint32(owner)

	allowed := map[string]bool{"--owner-pid": true}
	require := func(key string) (string, error) {
		value, exists := values[key]
		if !exists || value == "" { return "", fmt.Errorf("required argument missing: %s", key) }
		allowed[key] = true
		return value, nil
	}
	switch request.operation {
	case "--shortcut-commit":
		if request.shortcut, err = require("--shortcut"); err != nil { return request, err }
		if request.backup, err = require("--backup"); err != nil { return request, err }
		if request.temporary, err = require("--temporary"); err != nil { return request, err }
		if request.oldSHA256, err = require("--old-sha256"); err != nil { return request, err }
		if request.newSHA256, err = require("--new-sha256"); err != nil { return request, err }
		if !validShortcutRequestPath(request.shortcut) || !validShortcutRequestPath(request.backup) || !validShortcutRequestPath(request.temporary) {
			return request, fmt.Errorf("shortcut, backup and temporary paths must be absolute .lnk files")
		}
		dir := filepath.Clean(filepath.Dir(request.shortcut))
		if !strings.EqualFold(dir, filepath.Clean(filepath.Dir(request.backup))) ||
			!strings.EqualFold(dir, filepath.Clean(filepath.Dir(request.temporary))) ||
			strings.EqualFold(request.shortcut, request.backup) ||
			strings.EqualFold(request.shortcut, request.temporary) ||
			strings.EqualFold(request.backup, request.temporary) {
			return request, fmt.Errorf("shortcut mutation paths must be distinct and share one directory")
		}
		if !validShortcutRequestHash(request.oldSHA256) || !validShortcutRequestHash(request.newSHA256) {
			return request, fmt.Errorf("invalid expected shortcut SHA-256")
		}
	case "--shortcut-restore":
		if request.shortcut, err = require("--shortcut"); err != nil { return request, err }
		if request.backup, err = require("--backup"); err != nil { return request, err }
		if request.quarantine, err = require("--quarantine"); err != nil { return request, err }
		if request.oldSHA256, err = require("--old-sha256"); err != nil { return request, err }
		if request.newSHA256, err = require("--new-sha256"); err != nil { return request, err }
		if !validShortcutRequestPath(request.shortcut) || !validShortcutRequestPath(request.backup) || !validShortcutRequestPath(request.quarantine) {
			return request, fmt.Errorf("shortcut, backup and quarantine paths must be absolute .lnk files")
		}
		dir := filepath.Clean(filepath.Dir(request.shortcut))
		if !strings.EqualFold(dir, filepath.Clean(filepath.Dir(request.backup))) ||
			!strings.EqualFold(dir, filepath.Clean(filepath.Dir(request.quarantine))) ||
			strings.EqualFold(request.shortcut, request.backup) ||
			strings.EqualFold(request.shortcut, request.quarantine) ||
			strings.EqualFold(request.backup, request.quarantine) {
			return request, fmt.Errorf("shortcut recovery paths must be distinct and share one directory")
		}
		if !validShortcutRequestHash(request.oldSHA256) || !validShortcutRequestHash(request.newSHA256) {
			return request, fmt.Errorf("invalid expected shortcut SHA-256")
		}
	case "--shortcut-delete":
		if request.path, err = require("--path"); err != nil { return request, err }
		if request.sha256, err = require("--sha256"); err != nil { return request, err }
		if !validShortcutRequestPath(request.path) || !validShortcutRequestHash(request.sha256) {
			return request, fmt.Errorf("delete requires an absolute .lnk path and valid SHA-256")
		}
	}
	for key := range values {
		if !allowed[key] { return request, fmt.Errorf("unknown shortcut operation argument: %s", key) }
	}
	return request, nil
}