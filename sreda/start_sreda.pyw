import os
import subprocess
import sys
import time
import webbrowser

# Resolve directory path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CREATE_NO_WINDOW = 0x08000000

try:
    python_exe = sys.executable or "python"
    python_dir = os.path.dirname(python_exe)
    sibling_python = os.path.join(python_dir, "python.exe")
    if os.path.basename(python_exe).lower() == "pythonw.exe" and os.path.exists(sibling_python):
        python_exe = sibling_python

    # 1. Start the Flask server in the background (app.py)
    subprocess.Popen([python_exe, "app.py"], cwd=BASE_DIR, creationflags=CREATE_NO_WINDOW)
    
    # 2. Give the Flask server 2 seconds to initialize
    time.sleep(2.5)
    
    # 3. Start the global hotkey listener in the background (hotkey.py)
    subprocess.Popen([python_exe, "hotkey.py"], cwd=BASE_DIR, creationflags=CREATE_NO_WINDOW)

    # 4. Open the UI automatically in the default browser
    webbrowser.open("http://localhost:5000")
    
except Exception as e:
    # Log any startup errors to help debugging
    os.makedirs(os.path.join(BASE_DIR, "data"), exist_ok=True)
    log_path = os.path.join(BASE_DIR, "data", "launcher_errors.log")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Startup Failure: {str(e)}\n")
