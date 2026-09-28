local MANAGER_ORTHANC_USER = "dicom-manager"
local HTTP_TIMEOUT_SECONDS = 60
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
        -- Собираем метаданные локально: менеджер не должен вызывать Orthanc
        -- пока OnStoredInstance ожидает HTTP-ответ.
        local instance = ParseJson(RestApiGet("/instances/" .. instanceId))
        local series = ParseJson(RestApiGet("/series/" .. instance.ParentSeries))
        local study = ParseJson(RestApiGet("/studies/" .. series.ParentStudy))
        local instanceTags = ParseJson(RestApiGet("/instances/" .. instanceId .. "/simplified-tags"))
        local deviceParts = {}
        for _, key in ipairs({ "Modality", "Manufacturer", "ManufacturerModelName", "DeviceSerialNumber", "StationName" }) do
            local value = instanceTags[key]
            if type(value) == "string" and value ~= "" then
                table.insert(deviceParts, key .. "=" .. value)
            end
        end
        local headers = {
            ["Content-Type"] = "application/json",
            ["Authorization"] = "Bearer " .. token
        }
        local response = HttpPost(config.ManagerUrl .. "/dicom/upload/orthanc", DumpJson({
            patient_id = instanceTags.PatientID or "",
            device_model = table.concat(deviceParts, "; "),
            dicom_id = instanceId,
            file_name = instance.FileUuid or (instanceId .. ".dcm"),
            series_id = instance.ParentSeries,
            study_id = series.ParentStudy,
            dicom_image_uid = instance.MainDicomTags.SOPInstanceUID,
            dicom_series_uid = series.MainDicomTags.SeriesInstanceUID,
            dicom_study_uid = study.MainDicomTags.StudyInstanceUID
        }, true), headers)
        if response == nil then
            error("manager registration failed")
        end
        local uploaded = ParseJson(response)
        if type(uploaded) ~= "table" or uploaded.dicom_id ~= instanceId then
            error("manager registration returned no dicom_id")
        end
        -- Этот запрос отправляется только после получения ответа регистрации.
        -- Менеджер запускает worker в фоне и не ждёт его в HTTP-обработчике.
        local started = HttpPost(config.ManagerUrl .. "/dicom/upload/orthanc/" .. instanceId .. "/process", "{}", headers)
        if started == nil or ParseJson(started).dicom_id ~= instanceId then
            error("manager processing request failed")
        end
        return uploaded.dicom_id
    end)

    if success then
        print("[autoroute] Successfully forwarded: " .. instanceId .. ", dicom_id=" .. result)
    else
        print("[autoroute] Failed to forward " .. instanceId .. ": " .. tostring(result))
    end
end
