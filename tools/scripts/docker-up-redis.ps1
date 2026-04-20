$password = $env:REDIS_PASSWORD

if ([string]::IsNullOrWhiteSpace($password)) {
  $candidates = @(
    "apps/api/.env",
    "apps/worker/.env"
  )

  foreach ($path in $candidates) {
    if (-not (Test-Path $path)) {
      continue
    }

    $line = Get-Content $path | Where-Object { $_ -match '^\s*REDIS_PASSWORD\s*=' } | Select-Object -First 1
    if (-not $line) {
      continue
    }

    $password = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
    if (-not [string]::IsNullOrWhiteSpace($password)) {
      break
    }
  }
}

if ([string]::IsNullOrWhiteSpace($password)) {
  Write-Host "REDIS_PASSWORD is required"
  exit 1
}

docker rm -f my-redis *> $null
docker run -d --name my-redis -p 127.0.0.1:6379:6379 redis redis-server --requirepass "$password"
