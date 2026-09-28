-- Run from the repository root: lua orthanc/autoroute_test.lua
local realPrint = print
local calls, logs, settings, failLogin, failUpload, loginCount

function print(message)
    table.insert(logs, message)
end

function SetHttpTimeout(timeout)
    assert(timeout == 5)
end

function GetOrthancConfiguration()
    return { Autoroute = settings }
end

function DumpJson(value, keepStrings)
    assert(keepStrings)
    assert(value.email == "router@example.test" and value.password == "password")
    return "login-json"
end

function ParseJson(value)
    if value == "login-response" then
        return { token = "jwt-" .. loginCount }
    elseif value == "upload-response" then
        return { job_id = "job-id" }
    end
    return {}
end

function RestApiGet(path)
    table.insert(calls, { method = "GET", path = path })
    assert(path == "/instances/instance-id/file")
    return "dicom-bytes"
end

function HttpPost(url, body, headers)
    table.insert(calls, { method = "POST", url = url, body = body, headers = headers })
    if url == "http://manager/user/login" then
        loginCount = loginCount + 1
        assert(body == "login-json")
        assert(headers["Content-Type"] == "application/json")
        if failLogin == "throw" then error("HTTP 401") end
        if failLogin == "nil" then return nil end
        if failLogin == "invalid" then return "invalid" end
        return "login-response"
    end
    assert(url == "http://manager/dicom/upload")
    assert(body == "dicom-bytes")
    assert(headers["Authorization"] == "Bearer jwt-" .. loginCount)
    assert(headers["X-Instance-ID"] == "instance-id")
    assert(headers["Content-Type"] == "application/dicom")
    if failUpload == "throw" then error("HTTP 500") end
    if failUpload == "nil" then return nil end
    if failUpload == "invalid" then return "invalid" end
    return "upload-response"
end

local function reset()
    calls, logs, loginCount = {}, {}, 0
    failLogin, failUpload = nil, nil
    settings = { ManagerUrl = "http://manager/", Email = "router@example.test", Password = "password" }
    dofile("orthanc/autoroute.lua")
    Initialize()
end

local function assertFailed()
    assert(string.find(logs[#logs], "Failed to forward", 1, true))
    for _, line in ipairs(logs) do
        assert(not string.find(line, "Successfully forwarded", 1, true))
        assert(not string.find(line, "jwt-", 1, true))
        assert(not string.find(line, "password", 1, true))
    end
end

for _, origin in ipairs({ { RequestOrigin = "Lua" }, { RequestOrigin = "RestApi", Username = "dicom-manager" } }) do
    reset()
    OnStoredInstance("instance-id", {}, {}, origin)
    assert(#calls == 0, "manager/Lua uploads must not call back")
end

for _, origin in ipairs({ { RequestOrigin = "DicomProtocol" }, { RequestOrigin = "RestApi", Username = "dicom-orthanc" } }) do
    reset()
    OnStoredInstance("instance-id", {}, {}, origin)
    assert(#calls == 3)
    assert(string.find(logs[#logs], "job_id=job-id", 1, true))
    OnStoredInstance("instance-id", {}, {}, origin)
    assert(loginCount == 2, "JWT must be refreshed for the next callback")
end

for _, failure in ipairs({ "throw", "nil", "invalid" }) do
    reset()
    failLogin = failure
    OnStoredInstance("instance-id", {}, {}, { RequestOrigin = "DicomProtocol" })
    assert(#calls == 1, "failed login must not download or forward DICOM")
    assertFailed()
    reset()
    failUpload = failure
    OnStoredInstance("instance-id", {}, {}, { RequestOrigin = "DicomProtocol" })
    assertFailed()
end

reset()
settings.Password = ""
OnStoredInstance("instance-id", {}, {}, { RequestOrigin = "DicomProtocol" })
assert(#calls == 0)
assertFailed()

realPrint("autoroute: origin filtering, authorization, token renewal and error handling OK")
