@echo off
echo Building create-admin utility...
go build -o create-admin.exe ./cmd/create-admin
if %errorlevel% neq 0 (
    echo Build failed!
    exit /b 1
)

echo Running create-admin utility...
./create-admin.exe

echo Cleaning up...
del create-admin.exe
