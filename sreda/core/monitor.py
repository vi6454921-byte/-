import time
import threading
import sqlite3
from datetime import datetime
import win32gui
import win32process
import win32api
import psutil
import logging
from config import DB_PATH

logger = logging.getLogger("SredaMonitor")

# Configuration
MONITOR_INTERVAL = 3  # Check active window every 3 seconds
IDLE_THRESHOLD = 300  # 5 minutes in seconds

def get_idle_time() -> float:
    """Returns the time in seconds since the last user input (mouse/keyboard)."""
    try:
        last_input_time = win32api.GetLastInputInfo()
        current_tick = win32api.GetTickCount()
        idle_ms = current_tick - last_input_time
        return idle_ms / 1000.0
    except Exception as e:
        logger.error(f"Error getting idle time: {e}")
        return 0.0

def parse_browser_site(title: str, app: str) -> str:
    """Parses website name from Chrome or Edge window titles to track active tabs."""
    app_lower = app.lower()
    suffix = " - Google Chrome" if app_lower == "chrome.exe" else " - Microsoft Edge"
    
    parsed_title = title
    if title.endswith(suffix):
        parsed_title = title[:-len(suffix)]
        
    # Clean up standard empty tabs
    if parsed_title.strip() in ["Новая вкладка", "New Tab", "Google"]:
        return "New Tab"
        
    # Split by standard title dividers like " - "
    # e.g., "Hearthstone Wiki - Google Search" -> "Google Search"
    # e.g., "Vlad's Profile - GitHub" -> "GitHub"
    parts = parsed_title.split(" - ")
    if len(parts) > 1:
        site = parts[-1].strip()
        # If the last item is just noise, try the first
        if site.lower() in ["google chrome", "microsoft edge", "new tab", "новая вкладка", "google search"]:
            if len(parts) > 2:
                return parts[-2].strip()
            return "Google Search"
        return site
        
    return parsed_title.strip()

def get_active_window() -> tuple:
    """Returns (process_name, window_title) of the active window."""
    try:
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return "Idle", "No active window"
            
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        try:
            process = psutil.Process(pid)
            process_name = process.name()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            process_name = "System"
            
        window_title = win32gui.GetWindowText(hwnd)
        return process_name, window_title or "No Title"
    except Exception as e:
        logger.error(f"Error getting active window: {e}")
        return "Unknown", "Error fetching window details"

def log_activity_tick(app: str, title: str):
    """Logs a single tick of activity, updating or inserting database entries."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    timestamp = datetime.now().isoformat()
    
    # Fetch the very last activity log entry to see if we can aggregate
    cursor.execute("SELECT id, app, title, duration, timestamp FROM activity_log ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    
    if row:
        row_id, last_app, last_title, last_duration, last_time = row
        last_datetime = datetime.fromisoformat(last_time)
        time_diff = (datetime.now() - last_datetime).total_seconds()
        
        # If it is the same app and window, and the last update was within the last 15 seconds, just increment duration
        if last_app == app and last_title == title and time_diff < 15:
            new_duration = last_duration + MONITOR_INTERVAL
            cursor.execute(
                "UPDATE activity_log SET duration = ?, timestamp = ? WHERE id = ?",
                (new_duration, timestamp, row_id)
            )
            conn.commit()
            conn.close()
            return
            
    # Otherwise, insert a new row
    cursor.execute(
        "INSERT INTO activity_log (timestamp, app, title, duration) VALUES (?, ?, ?, ?)",
        (timestamp, app, title, MONITOR_INTERVAL)
    )
    conn.commit()
    conn.close()

def monitor_loop():
    """Main background loop checking window activity."""
    logger.info("Background window monitoring thread started.")
    
    time.sleep(5)
    
    while True:
        try:
            if get_idle_time() > IDLE_THRESHOLD:
                log_activity_tick("Idle", "User is away")
            else:
                app, title = get_active_window()
                
                # Check for browser names and parse domain/tab title
                app_lower = app.lower()
                if app_lower == "chrome.exe" or app_lower == "msedge.exe":
                    site_name = parse_browser_site(title, app)
                    if site_name:
                        # We log as chrome.exe::SiteName to separate website from application
                        app = f"{app}::{site_name}"
                        
                if app:
                    log_activity_tick(app, title)
        except Exception as e:
            logger.error(f"Error in monitor loop: {e}")
            
        time.sleep(MONITOR_INTERVAL)

def start_monitoring():
    """Spawns the monitoring loop in a background daemon thread."""
    monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
    monitor_thread.start()
