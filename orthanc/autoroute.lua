local DICOM_MANAGER_URL = "http://dicom-manager:10000/dicom/upload"
local HTTP_TIMEOUT_SECONDS = 5

function Initialize()
    SetHttpTimeout(HTTP_TIMEOUT_SECONDS)

    print("[autoroute] Initialized")
    print("[autoroute] Target: " .. DICOM_MANAGER_URL)
end

function OnStoredInstance(instanceId, tags, metadata, origin)
    if origin ~= nil and origin["RequestOrigin"] == "Lua" then
        return
    end

    print("[autoroute] Forwarding instance: " .. instanceId)

    local dicom = RestApiGet("/instances/" .. instanceId .. "/file")

    local headers = {
        ["Content-Type"] = "application/dicom",
        ["X-Instance-ID"] = instanceId
    }

    local success, result = pcall(function()
        return HttpPost(DICOM_MANAGER_URL, dicom, headers)
    end)

    if success then
        print("[autoroute] Successfully forwarded: " .. instanceId)
    else
        print("[autoroute] Failed to forward " .. instanceId .. ": " .. tostring(result))
    end
end