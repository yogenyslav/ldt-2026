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
