package upload

import (
	"archive/zip"
	"bytes"
	"io"
	"testing"
)

func TestDicomZipIsFinalized(t *testing.T) {
	data, err := dicomsToZip([]RawDicomData{{FileName: "test.dcm", Payload: []byte("dicom")}})
	if err != nil {
		t.Fatal(err)
	}

	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}

	if len(archive.File) != 1 || archive.File[0].Name != "test.dcm" {
		t.Fatal("incorrect archive entries")
	}

	r, err := archive.File[0].Open()
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()

	got, err := io.ReadAll(r)
	if err != nil || string(got) != "dicom" {
		t.Fatalf("incorrect DICOM payload: %q %v", got, err)
	}
}

func TestDicomZipPreservesNestedPaths(t *testing.T) {
	files := []RawDicomData{
		{FileName: "scan.dcm", Payload: []byte("root")},
		{FileName: "patient/study/series/scan.dcm", Payload: []byte("nested")},
		{FileName: "other/study/series/scan.dcm", Payload: []byte("other")},
		{FileName: "patient/study/series/image.DCM", Payload: []byte("uppercase")},
	}
	data, err := dicomsToZip(files)
	if err != nil {
		t.Fatal(err)
	}
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	if len(archive.File) != len(files) {
		t.Fatalf("got %d entries, want %d", len(archive.File), len(files))
	}
	for i, entry := range archive.File {
		if entry.Name != files[i].FileName {
			t.Fatalf("path = %q, want %q", entry.Name, files[i].FileName)
		}
		reader, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		payload, err := io.ReadAll(reader)
		reader.Close()
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(payload, files[i].Payload) {
			t.Fatalf("payload for %s = %q", entry.Name, payload)
		}
	}
}
