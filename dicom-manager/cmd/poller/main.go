package main

import (
	"os"
)

func main() {
	appName, ok := os.LookupEnv("APP_NAME")
	if !ok {
		panic("APP_NAME environment variable is not set")
	}

	println("Application Name:", appName)
}
