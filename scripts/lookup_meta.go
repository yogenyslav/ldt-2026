package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
)

func main() {
	baseUrl := ""
	allInstancesReq, err := http.NewRequest(http.MethodGet, baseUrl+"/instances", nil)
	if err != nil {
		panic(err)
	}

	allInstancesReq.Header.Add("Authorization", "Basic =")
	resp, err := http.DefaultClient.Do(allInstancesReq)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		panic("status != 200, got " + resp.Status)
	}

	bodyRaw, err := io.ReadAll(resp.Body)
	if err != nil {
		panic(err)
	}

	var instanceIDs []string
	if err = json.Unmarshal(bodyRaw, &instanceIDs); err != nil {
		panic(err)
	}

	err = os.Mkdir("./instances", os.ModePerm)
	if err != nil && !errors.Is(err, os.ErrExist) {
		panic(err)
	}

	for _, instanceID := range instanceIDs {
		func() {
			fmt.Println("getting image of ", instanceID)
			getDicomReq, err := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/instances/%s/preview", baseUrl, instanceID), nil)
			if err != nil {
				panic(err)
			}

			getDicomReq.Header.Add("Authorization", "Basic =")

			dicomResp, err := http.DefaultClient.Do(getDicomReq)
			if err != nil {
				panic(err)
			}
			defer dicomResp.Body.Close()

			if dicomResp.StatusCode != 200 {
				panic("status != 200, got " + resp.Status)
			}

			dicomRaw, err := io.ReadAll(dicomResp.Body)
			if err != nil {
				panic(err)
			}

			err = os.WriteFile(fmt.Sprintf("./instances/%s.png", instanceID), dicomRaw, os.ModePerm)
			if err != nil {
				panic(err)
			}
		}()
	}
}
