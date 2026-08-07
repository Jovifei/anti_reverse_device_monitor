<#
 daily sync debug
#>
$ErrorActionPreference = 'Stop'
try { chcp 65001 > $null } catch {}
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$repo = if ($PSScriptRoot) { Split-Path $PSScriptRoot -Parent } else { $PWD.Path }
("DBG_repo=[" + $repo + "] PSScriptRoot=[" + $PSScriptRoot + "] PWD=[" + $PWD.Path + "]") | Out-File 'D:\work\anti_reverse_device_monitor\logs\debug2.tmp' -Encoding utf8
Set-Location $repo
("DBG_after_setloc_ok") | Add-Content 'D:\work\anti_reverse_device_monitor\logs\debug2.tmp'
