-- Run from the repository root: lua orthanc/autoroute_test.lua
local realPrint = print
local calls, logs, settings, failLogin, failUpload, failStart, loginCount

function print(message)
    table.insert(logs, message)
end

function SetHttpTimeout(timeout)
    assert(timeout == 60)
end

function GetOrthancConfiguration()
    return { Autoroute = settings }
end

function DumpJson(value, keepStrings)
    assert(keepStrings)
    if value.email then
        assert(value.email == "router@example.test" and value.password == "password")
        return "login-json"
    end
    assert(value.dicom_id == "instance-id" and value.series_id == "series-id" and value.study_id == "study-id")
    assert(value.dicom_image_uid == "image-uid" and value.dicom_series_uid == "series-uid" and value.dicom_study_uid == "study-uid")
    assert(value.patient_id == "patient-1")
    assert(value.device_model == "Manufacturer=Test manufacturer; DeviceSerialNumber=serial-1")
    assert(value.patient_name == nil and value.patient_birth_date == nil and value.patient_sex == nil)
    return "metadata-json"
end

function ParseJson(value)
    if value == "login-response" then
        return { token = "jwt-" .. loginCount }
    elseif value == "upload-response" then
        return { dicom_id = "instance-id" }
    elseif value == "tags" then
        return { PatientID = "patient-1", PatientName = "Test^Patient", Manufacturer = "Test manufacturer", DeviceSerialNumber = "serial-1" }
    elseif value == "instance" then
        return { ParentSeries = "series-id", MainDicomTags = { SOPInstanceUID = "image-uid" } }
    elseif value == "series" then
        return { ParentStudy = "study-id", MainDicomTags = { SeriesInstanceUID = "series-uid" } }
    elseif value == "study" then
        return { MainDicomTags = { StudyInstanceUID = "study-uid" } }
    end
    return {}
end

function RestApiGet(path)
    table.insert(calls, { method = "GET", path = path })
    if path == "/instances/instance-id/simplified-tags" then return "tags" end
    if path == "/instances/instance-id" then return "instance" end
    if path == "/series/series-id" then return "series" end
    if path == "/studies/study-id" then return "study" end
    error("unexpected Orthanc request: " .. path)
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
    assert(headers["Authorization"] == "Bearer jwt-" .. loginCount)
    assert(headers["Content-Type"] == "application/json")
    if url == "http://manager/dicom/upload/orthanc/instance-id/process" then
        assert(calls[#calls - 1].url == "http://manager/dicom/upload/orthanc")
        assert(not failUpload, "processing must follow successful registration")
        if failStart == "throw" then error("HTTP 500") end
        if failStart == "nil" then return nil end
        if failStart == "invalid" then return "invalid" end
        return "upload-response"
    end
    assert(url == "http://manager/dicom/upload/orthanc")
    assert(body == "metadata-json")
    if failUpload == "throw" then error("HTTP 500") end
    if failUpload == "nil" then return nil end
    if failUpload == "invalid" then return "invalid" end
    return "upload-response"
end

local function reset()
    calls, logs, loginCount = {}, {}, 0
    failLogin, failUpload, failStart = nil, nil, nil
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
    assert(#calls == 7)
    assert(string.find(logs[#logs], "dicom_id=instance-id", 1, true))
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
    reset()
    failStart = failure
    OnStoredInstance("instance-id", {}, {}, { RequestOrigin = "DicomProtocol" })
    assertFailed()
end

reset()
settings.Password = ""
OnStoredInstance("instance-id", {}, {}, { RequestOrigin = "DicomProtocol" })
assert(#calls == 0)
assertFailed()

realPrint("autoroute: origin filtering, authorization, token renewal and error handling OK")
