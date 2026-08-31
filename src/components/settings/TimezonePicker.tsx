import React, { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronDown, LocateFixed } from 'lucide-react'

const COMMON_TIMEZONES = [
    { value: 'Europe/Lisbon', label: 'Europe/Lisbon (UTC+0/+1)' },
    { value: 'Europe/London', label: 'Europe/London (UTC+0/+1)' },
    { value: 'Europe/Madrid', label: 'Europe/Madrid (UTC+1/+2)' },
    { value: 'Europe/Paris', label: 'Europe/Paris (UTC+1/+2)' },
    { value: 'Europe/Berlin', label: 'Europe/Berlin (UTC+1/+2)' },
    { value: 'Europe/Rome', label: 'Europe/Rome (UTC+1/+2)' },
    { value: 'Europe/Amsterdam', label: 'Europe/Amsterdam (UTC+1/+2)' },
    { value: 'Europe/Brussels', label: 'Europe/Brussels (UTC+1/+2)' },
    { value: 'Europe/Vienna', label: 'Europe/Vienna (UTC+1/+2)' },
    { value: 'Europe/Zurich', label: 'Europe/Zurich (UTC+1/+2)' },
    { value: 'Europe/Stockholm', label: 'Europe/Stockholm (UTC+1/+2)' },
    { value: 'Europe/Oslo', label: 'Europe/Oslo (UTC+1/+2)' },
    { value: 'Europe/Copenhagen', label: 'Europe/Copenhagen (UTC+1/+2)' },
    { value: 'Europe/Helsinki', label: 'Europe/Helsinki (UTC+2/+3)' },
    { value: 'Europe/Warsaw', label: 'Europe/Warsaw (UTC+1/+2)' },
    { value: 'Europe/Prague', label: 'Europe/Prague (UTC+1/+2)' },
    { value: 'Europe/Budapest', label: 'Europe/Budapest (UTC+1/+2)' },
    { value: 'Europe/Bucharest', label: 'Europe/Bucharest (UTC+2/+3)' },
    { value: 'Europe/Sofia', label: 'Europe/Sofia (UTC+2/+3)' },
    { value: 'Europe/Athens', label: 'Europe/Athens (UTC+2/+3)' },
    { value: 'Europe/Dublin', label: 'Europe/Dublin (UTC+0/+1)' },
    { value: 'America/New_York', label: 'America/New_York (UTC-5/-4)' },
    { value: 'America/Chicago', label: 'America/Chicago (UTC-6/-5)' },
    { value: 'America/Denver', label: 'America/Denver (UTC-7/-6)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC-8/-7)' },
    { value: 'America/Toronto', label: 'America/Toronto (UTC-5/-4)' },
    { value: 'America/Vancouver', label: 'America/Vancouver (UTC-8/-7)' },
    { value: 'America/Mexico_City', label: 'America/Mexico_City (UTC-6)' },
    { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (UTC-3)' },
    { value: 'America/Argentina/Buenos_Aires', label: 'America/Argentina/Buenos_Aires (UTC-3)' },
    { value: 'America/Santiago', label: 'America/Santiago (UTC-4/-3)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
    { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
    { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (UTC+8)' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
    { value: 'Asia/Seoul', label: 'Asia/Seoul (UTC+9)' },
    { value: 'Asia/Taipei', label: 'Asia/Taipei (UTC+8)' },
    { value: 'Asia/Bangkok', label: 'Asia/Bangkok (UTC+7)' },
    { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala_Lumpur (UTC+8)' },
    { value: 'Asia/Jakarta', label: 'Asia/Jakarta (UTC+7)' },
    { value: 'Asia/Manila', label: 'Asia/Manila (UTC+8)' },
    { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+4)' },
    { value: 'Asia/Riyadh', label: 'Asia/Riyadh (UTC+3)' },
    { value: 'Australia/Sydney', label: 'Australia/Sydney (UTC+10/+11)' },
    { value: 'Australia/Melbourne', label: 'Australia/Melbourne (UTC+10/+11)' },
    { value: 'Australia/Brisbane', label: 'Australia/Brisbane (UTC+10)' },
    { value: 'Australia/Perth', label: 'Australia/Perth (UTC+8)' },
    { value: 'Pacific/Auckland', label: 'Pacific/Auckland (UTC+12/+13)' },
    { value: 'UTC', label: 'UTC (UTC+0)' },
]

const ALL_TIMEZONES = [
    ...COMMON_TIMEZONES,
    { value: 'Europe/Andorra', label: 'Europe/Andorra' },
    { value: 'Europe/Chisinau', label: 'Europe/Chisinau' },
    { value: 'Europe/Gibraltar', label: 'Europe/Gibraltar' },
    { value: 'Europe/Guernsey', label: 'Europe/Guernsey' },
    { value: 'Europe/Isle_of_Man', label: 'Europe/Isle_of_Man' },
    { value: 'Europe/Jersey', label: 'Europe/Jersey' },
    { value: 'Europe/Kaliningrad', label: 'Europe/Kaliningrad' },
    { value: 'Europe/Kiev', label: 'Europe/Kiev' },
    { value: 'Europe/Mariehamn', label: 'Europe/Mariehamn' },
    { value: 'Europe/Monaco', label: 'Europe/Monaco' },
    { value: 'Europe/Podgorica', label: 'Europe/Podgorica' },
    { value: 'Europe/San_Marino', label: 'Europe/San_Marino' },
    { value: 'Europe/Sarajevo', label: 'Europe/Sarajevo' },
    { value: 'Europe/Skopje', label: 'Europe/Skopje' },
    { value: 'Europe/Tirane', label: 'Europe/Tirane' },
    { value: 'Europe/Uzhgorod', label: 'Europe/Uzhgorod' },
    { value: 'Europe/Vaduz', label: 'Europe/Vaduz' },
    { value: 'Europe/Vatican', label: 'Europe/Vatican' },
    { value: 'America/Anchorage', label: 'America/Anchorage' },
    { value: 'America/Adak', label: 'America/Adak' },
    { value: 'America/Juneau', label: 'America/Juneau' },
    { value: 'America/Nome', label: 'America/Nome' },
    { value: 'America/Sitka', label: 'America/Sitka' },
    { value: 'America/Yakutat', label: 'America/Yakutat' },
    { value: 'America/Metlakatla', label: 'America/Metlakatla' },
    { value: 'America/Phoenix', label: 'America/Phoenix' },
    { value: 'America/Boise', label: 'America/Boise' },
    { value: 'America/Indiana/Indianapolis', label: 'America/Indiana/Indianapolis' },
    { value: 'America/Indiana/Vincennes', label: 'America/Indiana/Vincennes' },
    { value: 'America/Indiana/Winamac', label: 'America/Indiana/Winamac' },
    { value: 'America/Indiana/Marengo', label: 'America/Indiana/Marengo' },
    { value: 'America/Indiana/Petersburg', label: 'America/Indiana/Petersburg' },
    { value: 'America/Indiana/Vevay', label: 'America/Indiana/Vevay' },
    { value: 'America/Kentucky/Louisville', label: 'America/Kentucky/Louisville' },
    { value: 'America/Kentucky/Monticello', label: 'America/Kentucky/Monticello' },
    { value: 'America/Menominee', label: 'America/Menominee' },
    { value: 'America/Detroit', label: 'America/Detroit' },
    { value: 'America/Indiana/Tell_City', label: 'America/Indiana/Tell_City' },
    { value: 'America/Indiana/Knox', label: 'America/Indiana/Knox' },
    { value: 'America/Winnipeg', label: 'America/Winnipeg' },
    { value: 'America/Rainy_River', label: 'America/Rainy_River' },
    { value: 'America/Resolute', label: 'America/Resolute' },
    { value: 'America/Rankin_Inlet', label: 'America/Rankin_Inlet' },
    { value: 'America/St_Johns', label: 'America/St_Johns' },
    { value: 'America/Halifax', label: 'America/Halifax' },
    { value: 'America/Glace_Bay', label: 'America/Glace_Bay' },
    { value: 'America/Goose_Bay', label: 'America/Goose_Bay' },
    { value: 'America/Moncton', label: 'America/Moncton' },
    { value: 'America/Thunder_Bay', label: 'America/Thunder_Bay' },
    { value: 'America/Pangnirtung', label: 'America/Pangnirtung' },
    { value: 'America/Iqaluit', label: 'America/Iqaluit' },
    { value: 'America/Atikokan', label: 'America/Atikokan' },
    { value: 'America/Blanc-Sablon', label: 'America/Blanc-Sablon' },
    { value: 'America/Edmonton', label: 'America/Edmonton' },
    { value: 'America/Cambridge_Bay', label: 'America/Cambridge_Bay' },
    { value: 'America/Yellowknife', label: 'America/Yellowknife' },
    { value: 'America/Inuvik', label: 'America/Inuvik' },
    { value: 'America/Creston', label: 'America/Creston' },
    { value: 'America/Dawson_Creek', label: 'America/Dawson_Creek' },
    { value: 'America/Fort_Nelson', label: 'America/Fort_Nelson' },
    { value: 'America/Hermosillo', label: 'America/Hermosillo' },
    { value: 'America/Mazatlan', label: 'America/Mazatlan' },
    { value: 'America/Chihuahua', label: 'America/Chihuahua' },
    { value: 'America/Ojinaga', label: 'America/Ojinaga' },
    { value: 'America/Bahia_Banderas', label: 'America/Bahia_Banderas' },
    { value: 'America/Matamoros', label: 'America/Matamoros' },
    { value: 'America/Monterrey', label: 'America/Monterrey' },
    { value: 'America/Merida', label: 'America/Merida' },
    { value: 'America/Cancun', label: 'America/Cancun' },
    { value: 'America/Noronha', label: 'America/Noronha' },
    { value: 'America/Belem', label: 'America/Belem' },
    { value: 'America/Fortaleza', label: 'America/Fortaleza' },
    { value: 'America/Recife', label: 'America/Recife' },
    { value: 'America/Araguaina', label: 'America/Araguaina' },
    { value: 'America/Maceio', label: 'America/Maceio' },
    { value: 'America/Bahia', label: 'America/Bahia' },
    { value: 'America/Campo_Grande', label: 'America/Campo_Grande' },
    { value: 'America/Cuiaba', label: 'America/Cuiaba' },
    { value: 'America/Santarem', label: 'America/Santarem' },
    { value: 'America/Porto_Velho', label: 'America/Porto_Velho' },
    { value: 'America/Boa_Vista', label: 'America/Boa_Vista' },
    { value: 'America/Manaus', label: 'America/Manaus' },
    { value: 'America/Eirunepe', label: 'America/Eirunepe' },
    { value: 'America/Rio_Branco', label: 'America/Rio_Branco' },
    { value: 'America/Godthab', label: 'America/Godthab' },
    { value: 'America/Danmarkshavn', label: 'America/Danmarkshavn' },
    { value: 'America/Scoresbysund', label: 'America/Scoresbysund' },
    { value: 'America/Thule', label: 'America/Thule' },
    { value: 'America/Guatemala', label: 'America/Guatemala' },
    { value: 'America/Belize', label: 'America/Belize' },
    { value: 'America/Tegucigalpa', label: 'America/Tegucigalpa' },
    { value: 'America/Managua', label: 'America/Managua' },
    { value: 'America/Costa_Rica', label: 'America/Costa_Rica' },
    { value: 'America/Panama', label: 'America/Panama' },
    { value: 'America/Grand_Turk', label: 'America/Grand_Turk' },
    { value: 'America/Havana', label: 'America/Havana' },
    { value: 'America/Jamaica', label: 'America/Jamaica' },
    { value: 'America/Port-au-Prince', label: 'America/Port-au-Prince' },
    { value: 'America/Santo_Domingo', label: 'America/Santo_Domingo' },
    { value: 'America/Marigot', label: 'America/Marigot' },
    { value: 'America/Lower_Princes', label: 'America/Lower_Princes' },
    { value: 'America/Kralendijk', label: 'America/Kralendijk' },
    { value: 'America/St_Barthelemy', label: 'America/St_Barthelemy' },
    { value: 'America/St_Martin', label: 'America/St_Martin' },
    { value: 'America/St_Thomas', label: 'America/St_Thomas' },
    { value: 'America/Tortola', label: 'America/Tortola' },
    { value: 'America/St_John', label: 'America/St_John' },
    { value: 'America/Anguilla', label: 'America/Anguilla' },
    { value: 'America/Dominica', label: 'America/Dominica' },
    { value: 'America/Grenada', label: 'America/Grenada' },
    { value: 'America/Guadeloupe', label: 'America/Guadeloupe' },
    { value: 'America/Montserrat', label: 'America/Montserrat' },
    { value: 'America/St_Kitts', label: 'America/St_Kitts' },
    { value: 'America/St_Lucia', label: 'America/St_Lucia' },
    { value: 'America/St_Vincent', label: 'America/St_Vincent' },
    { value: 'America/Antigua', label: 'America/Antigua' },
    { value: 'America/Barbados', label: 'America/Barbados' },
    { value: 'America/Martinique', label: 'America/Martinique' },
    { value: 'America/St_Barthelemy', label: 'America/St_Barthelemy' },
    { value: 'America/Curacao', label: 'America/Curacao' },
    { value: 'America/Aruba', label: 'America/Aruba' },
    { value: 'America/Paramaribo', label: 'America/Paramaribo' },
    { value: 'America/Cayenne', label: 'America/Cayenne' },
    { value: 'America/St_Georges', label: 'America/St_Georges' },
    { value: 'America/Caracas', label: 'America/Caracas' },
    { value: 'America/La_Paz', label: 'America/La_Paz' },
    { value: 'America/Lima', label: 'America/Lima' },
    { value: 'America/Bogota', label: 'America/Bogota' },
    { value: 'America/Guayaquil', label: 'America/Guayaquil' },
    { value: 'Asia/Aden', label: 'Asia/Aden' },
    { value: 'Asia/Almaty', label: 'Asia/Almaty' },
    { value: 'Asia/Amman', label: 'Asia/Amman' },
    { value: 'Asia/Anadyr', label: 'Asia/Anadyr' },
    { value: 'Asia/Aqtau', label: 'Asia/Aqtau' },
    { value: 'Asia/Aqtobe', label: 'Asia/Aqtobe' },
    { value: 'Asia/Ashgabat', label: 'Asia/Ashgabat' },
    { value: 'Asia/Atyrau', label: 'Asia/Atyrau' },
    { value: 'Asia/Baghdad', label: 'Asia/Baghdad' },
    { value: 'Asia/Bahrain', label: 'Asia/Bahrain' },
    { value: 'Asia/Baku', label: 'Asia/Baku' },
    { value: 'Asia/Bangkok', label: 'Asia/Bangkok' },
    { value: 'Asia/Barnaul', label: 'Asia/Barnaul' },
    { value: 'Asia/Beirut', label: 'Asia/Beirut' },
    { value: 'Asia/Bishkek', label: 'Asia/Bishkek' },
    { value: 'Asia/Brunei', label: 'Asia/Brunei' },
    { value: 'Asia/Chita', label: 'Asia/Chita' },
    { value: 'Asia/Choibalsan', label: 'Asia/Choibalsan' },
    { value: 'Asia/Colombo', label: 'Asia/Colombo' },
    { value: 'Asia/Damascus', label: 'Asia/Damascus' },
    { value: 'Asia/Dhaka', label: 'Asia/Dhaka' },
    { value: 'Asia/Dili', label: 'Asia/Dili' },
    { value: 'Asia/Dubai', label: 'Asia/Dubai' },
    { value: 'Asia/Dushanbe', label: 'Asia/Dushanbe' },
    { value: 'Asia/Famagusta', label: 'Asia/Famagusta' },
    { value: 'Asia/Gaza', label: 'Asia/Gaza' },
    { value: 'Asia/Hebron', label: 'Asia/Hebron' },
    { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh' },
    { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong' },
    { value: 'Asia/Hovd', label: 'Asia/Hovd' },
    { value: 'Asia/Irkutsk', label: 'Asia/Irkutsk' },
    { value: 'Asia/Jakarta', label: 'Asia/Jakarta' },
    { value: 'Asia/Jayapura', label: 'Asia/Jayapura' },
    { value: 'Asia/Jerusalem', label: 'Asia/Jerusalem' },
    { value: 'Asia/Kabul', label: 'Asia/Kabul' },
    { value: 'Asia/Kamchatka', label: 'Asia/Kamchatka' },
    { value: 'Asia/Karachi', label: 'Asia/Karachi' },
    { value: 'Asia/Kathmandu', label: 'Asia/Kathmandu' },
    { value: 'Asia/Khandyga', label: 'Asia/Khandyga' },
    { value: 'Asia/Kolkata', label: 'Asia/Kolkata' },
    { value: 'Asia/Krasnoyarsk', label: 'Asia/Krasnoyarsk' },
    { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala_Lumpur' },
    { value: 'Asia/Kuching', label: 'Asia/Kuching' },
    { value: 'Asia/Kuwait', label: 'Asia/Kuwait' },
    { value: 'Asia/Macau', label: 'Asia/Macau' },
    { value: 'Asia/Magadan', label: 'Asia/Magadan' },
    { value: 'Asia/Makassar', label: 'Asia/Makassar' },
    { value: 'Asia/Manila', label: 'Asia/Manila' },
    { value: 'Asia/Muscat', label: 'Asia/Muscat' },
    { value: 'Asia/Nicosia', label: 'Asia/Nicosia' },
    { value: 'Asia/Novokuznetsk', label: 'Asia/Novokuznetsk' },
    { value: 'Asia/Novosibirsk', label: 'Asia/Novosibirsk' },
    { value: 'Asia/Omsk', label: 'Asia/Omsk' },
    { value: 'Asia/Oral', label: 'Asia/Oral' },
    { value: 'Asia/Phnom_Penh', label: 'Asia/Phnom_Penh' },
    { value: 'Asia/Pontianak', label: 'Asia/Pontianak' },
    { value: 'Asia/Pyongyang', label: 'Asia/Pyongyang' },
    { value: 'Asia/Qatar', label: 'Asia/Qatar' },
    { value: 'Asia/Qostanay', label: 'Asia/Qostanay' },
    { value: 'Asia/Qyzylorda', label: 'Asia/Qyzylorda' },
    { value: 'Asia/Riyadh', label: 'Asia/Riyadh' },
    { value: 'Asia/Sakhalin', label: 'Asia/Sakhalin' },
    { value: 'Asia/Samarkand', label: 'Asia/Samarkand' },
    { value: 'Asia/Seoul', label: 'Asia/Seoul' },
    { value: 'Asia/Shanghai', label: 'Asia/Shanghai' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore' },
    { value: 'Asia/Srednekolymsk', label: 'Asia/Srednekolymsk' },
    { value: 'Asia/Taipei', label: 'Asia/Taipei' },
    { value: 'Asia/Tashkent', label: 'Asia/Tashkent' },
    { value: 'Asia/Tbilisi', label: 'Asia/Tbilisi' },
    { value: 'Asia/Tehran', label: 'Asia/Tehran' },
    { value: 'Asia/Thimphu', label: 'Asia/Thimphu' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
    { value: 'Asia/Tomsk', label: 'Asia/Tomsk' },
    { value: 'Asia/Ulaanbaatar', label: 'Asia/Ulaanbaatar' },
    { value: 'Asia/Urumqi', label: 'Asia/Urumqi' },
    { value: 'Asia/Ust-Nera', label: 'Asia/Ust-Nera' },
    { value: 'Asia/Vientiane', label: 'Asia/Vientiane' },
    { value: 'Asia/Vladivostok', label: 'Asia/Vladivostok' },
    { value: 'Asia/Yakutsk', label: 'Asia/Yakutsk' },
    { value: 'Asia/Yangon', label: 'Asia/Yangon' },
    { value: 'Asia/Yekaterinburg', label: 'Asia/Yekaterinburg' },
    { value: 'Asia/Yerevan', label: 'Asia/Yerevan' },
    { value: 'Australia/Adelaide', label: 'Australia/Adelaide' },
    { value: 'Australia/Broken_Hill', label: 'Australia/Broken_Hill' },
    { value: 'Australia/Darwin', label: 'Australia/Darwin' },
    { value: 'Australia/Eucla', label: 'Australia/Eucla' },
    { value: 'Australia/Hobart', label: 'Australia/Hobart' },
    { value: 'Australia/Lindeman', label: 'Australia/Lindeman' },
    { value: 'Australia/Lord_Howe', label: 'Australia/Lord_Howe' },
    { value: 'Pacific/Apia', label: 'Pacific/Apia' },
    { value: 'Pacific/Bougainville', label: 'Pacific/Bougainville' },
    { value: 'Pacific/Chatham', label: 'Pacific/Chatham' },
    { value: 'Pacific/Chuuk', label: 'Pacific/Chuuk' },
    { value: 'Pacific/Easter', label: 'Pacific/Easter' },
    { value: 'Pacific/Efate', label: 'Pacific/Efate' },
    { value: 'Pacific/Enderbury', label: 'Pacific/Enderbury' },
    { value: 'Pacific/Fakaofo', label: 'Pacific/Fakaofo' },
    { value: 'Pacific/Fiji', label: 'Pacific/Fiji' },
    { value: 'Pacific/Funafuti', label: 'Pacific/Funafuti' },
    { value: 'Pacific/Galapagos', label: 'Pacific/Galapagos' },
    { value: 'Pacific/Gambier', label: 'Pacific/Gambier' },
    { value: 'Pacific/Guadalcanal', label: 'Pacific/Guadalcanal' },
    { value: 'Pacific/Guam', label: 'Pacific/Guam' },
    { value: 'Pacific/Honolulu', label: 'Pacific/Honolulu' },
    { value: 'Pacific/Kiritimati', label: 'Pacific/Kiritimati' },
    { value: 'Pacific/Kosrae', label: 'Pacific/Kosrae' },
    { value: 'Pacific/Kwajalein', label: 'Pacific/Kwajalein' },
    { value: 'Pacific/Majuro', label: 'Pacific/Majuro' },
    { value: 'Pacific/Marquesas', label: 'Pacific/Marquesas' },
    { value: 'Pacific/Midway', label: 'Pacific/Midway' },
    { value: 'Pacific/Nauru', label: 'Pacific/Nauru' },
    { value: 'Pacific/Niue', label: 'Pacific/Niue' },
    { value: 'Pacific/Norfolk', label: 'Pacific/Norfolk' },
    { value: 'Pacific/Noumea', label: 'Pacific/Noumea' },
    { value: 'Pacific/Pago_Pago', label: 'Pacific/Pago_Pago' },
    { value: 'Pacific/Palau', label: 'Pacific/Palau' },
    { value: 'Pacific/Pitcairn', label: 'Pacific/Pitcairn' },
    { value: 'Pacific/Pohnpei', label: 'Pacific/Pohnpei' },
    { value: 'Pacific/Port_Moresby', label: 'Pacific/Port_Moresby' },
    { value: 'Pacific/Rarotonga', label: 'Pacific/Rarotonga' },
    { value: 'Pacific/Saipan', label: 'Pacific/Saipan' },
    { value: 'Pacific/Tahiti', label: 'Pacific/Tahiti' },
    { value: 'Pacific/Tarawa', label: 'Pacific/Tarawa' },
    { value: 'Pacific/Tongatapu', label: 'Pacific/Tongatapu' },
    { value: 'Pacific/Wake', label: 'Pacific/Wake' },
    { value: 'Pacific/Wallis', label: 'Pacific/Wallis' },
    { value: 'Africa/Abidjan', label: 'Africa/Abidjan' },
    { value: 'Africa/Accra', label: 'Africa/Accra' },
    { value: 'Africa/Addis_Ababa', label: 'Africa/Addis_Ababa' },
    { value: 'Africa/Algiers', label: 'Africa/Algiers' },
    { value: 'Africa/Asmara', label: 'Africa/Asmara' },
    { value: 'Africa/Bamako', label: 'Africa/Bamako' },
    { value: 'Africa/Bangui', label: 'Africa/Bangui' },
    { value: 'Africa/Banjul', label: 'Africa/Banjul' },
    { value: 'Africa/Bissau', label: 'Africa/Bissau' },
    { value: 'Africa/Blantyre', label: 'Africa/Blantyre' },
    { value: 'Africa/Brazzaville', label: 'Africa/Brazzaville' },
    { value: 'Africa/Bujumbura', label: 'Africa/Bujumbura' },
    { value: 'Africa/Cairo', label: 'Africa/Cairo' },
    { value: 'Africa/Casablanca', label: 'Africa/Casablanca' },
    { value: 'Africa/Ceuta', label: 'Africa/Ceuta' },
    { value: 'Africa/Conakry', label: 'Africa/Conakry' },
    { value: 'Africa/Dakar', label: 'Africa/Dakar' },
    { value: 'Africa/Dar_es_Salaam', label: 'Africa/Dar_es_Salaam' },
    { value: 'Africa/Djibouti', label: 'Africa/Djibouti' },
    { value: 'Africa/Douala', label: 'Africa/Douala' },
    { value: 'Africa/El_Aaiun', label: 'Africa/El_Aaiun' },
    { value: 'Africa/Freetown', label: 'Africa/Freetown' },
    { value: 'Africa/Gaborone', label: 'Africa/Gaborone' },
    { value: 'Africa/Harare', label: 'Africa/Harare' },
    { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg' },
    { value: 'Africa/Juba', label: 'Africa/Juba' },
    { value: 'Africa/Kampala', label: 'Africa/Kampula' },
    { value: 'Africa/Khartoum', label: 'Africa/Khartoum' },
    { value: 'Africa/Kigali', label: 'Africa/Kigali' },
    { value: 'Africa/Kinshasa', label: 'Africa/Kinshasa' },
    { value: 'Africa/Lagos', label: 'Africa/Lagos' },
    { value: 'Africa/Libreville', label: 'Africa/Libreville' },
    { value: 'Africa/Lome', label: 'Africa/Lome' },
    { value: 'Africa/Luanda', label: 'Africa/Luanda' },
    { value: 'Africa/Lubumbashi', label: 'Africa/Lubumbashi' },
    { value: 'Africa/Lusaka', label: 'Africa/Lusaka' },
    { value: 'Africa/Malabo', label: 'Africa/Malabo' },
    { value: 'Africa/Maputo', label: 'Africa/Maputo' },
    { value: 'Africa/Maseru', label: 'Africa/Maseru' },
    { value: 'Africa/Mbabane', label: 'Africa/Mbabane' },
    { value: 'Africa/Mogadishu', label: 'Africa/Mogadishu' },
    { value: 'Africa/Monrovia', label: 'Africa/Monrovia' },
    { value: 'Africa/Nairobi', label: 'Africa/Nairobi' },
    { value: 'Africa/Ndjamena', label: 'Africa/Ndjamena' },
    { value: 'Africa/Niamey', label: 'Africa/Niamey' },
    { value: 'Africa/Nouakchott', label: 'Africa/Nouakchott' },
    { value: 'Africa/Ouagadougou', label: 'Africa/Ouagadougou' },
    { value: 'Africa/Porto-Novo', label: 'Africa/Porto-Novo' },
    { value: 'Africa/Sao_Tome', label: 'Africa/Sao_Tome' },
    { value: 'Africa/Tripoli', label: 'Africa/Tripoli' },
    { value: 'Africa/Tunis', label: 'Africa/Tunis' },
    { value: 'Africa/Windhoek', label: 'Africa/Windhoek' },
]

interface TimezonePickerProps {
    value: string
    onChange: (value: string) => void
    autoDetectLabel?: string
    disabled?: boolean
}

export const TimezonePicker: React.FC<TimezonePickerProps> = ({ value, onChange, autoDetectLabel, disabled }) => {
    const [search, setSearch] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const filtered = useMemo(() => {
        if (search.trim() === '') {
            return COMMON_TIMEZONES
        }
        const lower = search.toLowerCase()
        return ALL_TIMEZONES.filter(tz => tz.label.toLowerCase().includes(lower) || tz.value.toLowerCase().includes(lower))
    }, [search])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleSelect = (tzValue: string) => {
        onChange(tzValue)
        setIsOpen(false)
        setSearch('')
    }

    const selected = ALL_TIMEZONES.find(tz => tz.value === value) || COMMON_TIMEZONES.find(tz => tz.value === value)

    return (
        <div className="timezone-picker" ref={dropdownRef}>
            <button
                type="button"
                className={`timezone-picker__trigger ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
            >
                <span className="timezone-picker__value">{selected?.label || value}</span>
                <ChevronDown size={16} strokeWidth={2.2} className={`timezone-picker__chevron${isOpen ? ' rotated' : ''}`} />
            </button>

            {autoDetectLabel && (
                <div className="timezone-picker__auto-detect">
                    <LocateFixed size={13} strokeWidth={2.2} />
                    <span>{autoDetectLabel}</span>
                </div>
            )}

            {isOpen && !disabled && (
                <div className="timezone-picker__dropdown">
                    <input
                        type="text"
                        className="timezone-picker__search"
                        placeholder="Search timezone..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                    <div className="timezone-picker__list">
                        {filtered.map(tz => (
                            <button
                                key={tz.value}
                                type="button"
                                className={`timezone-picker__item ${tz.value === value ? 'selected' : ''}`}
                                onClick={() => handleSelect(tz.value)}
                            >
                                {tz.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}