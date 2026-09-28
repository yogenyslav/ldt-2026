local MANAGER_ORTHANC_USER = "dicom-manager"
local HTTP_TIMEOUT_SECONDS = 5
local config = {}

local function Login()
    if config.Email == nil or config.Email == "" or
       config.Password == nil or config.Password == "" then
        error("ORTHANC_AUTOROUTE_EMAIL and ORTHANC_AUTOROUTE_PASSWORD must be configured")
    end

    local response = HttpPost(config.ManagerUrl .. "/user/login", DumpJson({
        email = config.Email,
        password = config.Password
    }, true), { ["Content-Type"] = "application/json" })
    if response == nil then
        error("manager login failed")
    end
    local auth = ParseJson(response)
    if type(auth) ~= "table" or type(auth.token) ~= "string" or auth.token == "" then
        error("manager login returned no token")
    end
    return auth.token
end

function Initialize()
    SetHttpTimeout(HTTP_TIMEOUT_SECONDS)
    config = GetOrthancConfiguration()["Autoroute"] or {}
    config.ManagerUrl = string.gsub(config.ManagerUrl or "http://dicom-manager:10000", "/+$", "")

    print("[autoroute] Initialized")
    print("[autoroute] Target: " .. config.ManagerUrl)
end

function OnStoredInstance(instanceId, tags, metadata, origin)
    if origin ~= nil and origin["RequestOrigin"] == "Lua" then
        return
    end

    if origin ~= nil and origin["RequestOrigin"] == "RestApi" and
       origin["Username"] == MANAGER_ORTHANC_USER then
        print("[autoroute] Skipping manager upload: " .. instanceId)
        return
    end

    print("[autoroute] Forwarding instance: " .. instanceId)

    local success, result = pcall(function()
        local token = Login()
        local dicom = RestApiGet("/instances/" .. instanceId .. "/file")
        local response = HttpPost(config.ManagerUrl .. "/dicom/upload", dicom, {
            ["Content-Type"] = "application/dicom",
            ["X-Instance-ID"] = instanceId,
            ["Authorization"] = "Bearer " .. token
        })
        if response == nil then
            error("manager upload failed")
        end
        local uploaded = ParseJson(response)
        if type(uploaded) ~= "table" or type(uploaded.job_id) ~= "string" or uploaded.job_id == "" then
            error("manager upload returned no job_id")
        end
        return uploaded.job_id
    end)

    if success then
        print("[autoroute] Successfully forwarded: " .. instanceId .. ", job_id=" .. result)
    else
        print("[autoroute] Failed to forward " .. instanceId .. ": " .. tostring(result))
    end
end
