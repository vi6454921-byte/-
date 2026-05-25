import keyboard
import subprocess
import os
import sys

def launch_sreda():
    print("Запускаю безрамочное окно «Среды» (Chrome App Mode)...")
    # Resolve potential Google Chrome paths on Windows
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%USERPROFILE%\AppData\Local\Google\Chrome\Application\chrome.exe")
    ]
    
    chrome_path = None
    for path in chrome_paths:
        if os.path.exists(path):
            chrome_path = path
            break
            
    if chrome_path:
        # Launch in Chrome's beautiful borderless application mode!
        # This opens Sreda in a separate custom window without search bar/tabs, like a real desktop app!
        subprocess.Popen(f'"{chrome_path}" --app=http://localhost:5000', shell=True)
    else:
        # Fallback to opening default web browser
        import webbrowser
        webbrowser.open("http://localhost:5000")

def main():
    print("==================================================")
    print("  Фоновый слушатель хоткея для «Среды» запущен!  ")
    print("  Нажми  [ Ctrl + Alt + S ]  в любой момент отовсюду на ПК,  ")
    print("  чтобы мгновенно вызвать красивое безрамочное окно чата.  ")
    print("  Нажмите Ctrl+C для выхода.                      ")
    print("==================================================")
    
    # Register the shortcut
    keyboard.add_hotkey('ctrl+alt+s', launch_sreda)
    
    # Keep running infinitely
    keyboard.wait()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\nСлушатель хоткея остановлен.")
        sys.exit(0)
    except Exception as e:
        print(f"Ошибка запуска слушателя: {e}")
        print("Пожалуйста, убедитесь, что библиотека 'keyboard' установлена.")
