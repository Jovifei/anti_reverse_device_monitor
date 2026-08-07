<#
 test block comment
#>
$ErrorActionPreference = 'Stop'
("BLOCK_PWD=[" + $PWD.Path + "]") | Out-File 'D:\work\anti_reverse_device_monitor\logs\blocktest.tmp' -Encoding utf8
("BLOCK_PSScriptRoot=[" + $PSScriptRoot + "]") | Add-Content 'D:\work\anti_reverse_device_monitor\logs\blocktest.tmp'
Set-Location $PWD.Path
("AFTER_SETLOC_OK") | Add-Content 'D:\work\anti_reverse_device_monitor\logs\blocktest.tmp'
