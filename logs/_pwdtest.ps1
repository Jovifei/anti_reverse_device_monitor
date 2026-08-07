("SCRIPT_PWD=[" + $PWD.Path + "]") | Out-File 'D:\work\anti_reverse_device_monitor\logs\pwdtest.tmp' -Encoding utf8
("SCRIPT_PSScriptRoot=[" + $PSScriptRoot + "]") | Add-Content 'D:\work\anti_reverse_device_monitor\logs\pwdtest.tmp'
