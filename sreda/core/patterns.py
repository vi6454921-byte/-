import sqlite3
from datetime import datetime
import logging
from config import DB_PATH

logger = logging.getLogger("SredaPatterns")

# Hour mappings to general time blocks of the day
TIME_BLOCKS = {
    "Morning": (6, 12, "утрам"),
    "Afternoon": (12, 18, "днем"),
    "Evening": (18, 24, "вечерам"),
    "Night": (0, 6, "ночам")
}

def get_time_block(hour: int) -> str:
    """Returns the time block name based on the hour of the day."""
    for block, (start, end, _) in TIME_BLOCKS.items():
        if start <= hour < end:
            return block
    return "Night"

def run_pattern_analysis() -> int:
    """
    Analyzes activity logs and extracts recurring patterns/habits.
    Saves new patterns into the 'learned_patterns' database table.
    Returns the number of patterns identified/updated.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. Fetch all activity logs
    cursor.execute("SELECT timestamp, app, duration FROM activity_log WHERE app != 'Idle' AND app != 'System'")
    logs = cursor.fetchall()
    
    if len(logs) < 10:  # Not enough data yet
        conn.close()
        return 0
        
    # Data structure: habits[app][time_block][date] = total_duration
    habits = {}
    unique_dates = set()
    
    for log_time_str, app, duration in logs:
        try:
            dt = datetime.fromisoformat(log_time_str)
            date_key = dt.date().isoformat()
            unique_dates.add(date_key)
            
            block = get_time_block(dt.hour)
            
            if app not in habits:
                habits[app] = {}
            if block not in habits[app]:
                habits[app][block] = {}
            if date_key not in habits[app][block]:
                habits[app][block][date_key] = 0
                
            habits[app][block][date_key] += duration
        except Exception as e:
            logger.error(f"Error parsing log timestamp {log_time_str}: {e}")
            
    total_days = len(unique_dates)
    if total_days < 2:  # Need at least 2 days of logs to start identifying patterns
        conn.close()
        return 0
        
    patterns_found = 0
    now_str = datetime.now().isoformat()
    
    # 2. Extract recurring habits
    for app, blocks in habits.items():
        for block, dates_durations in blocks.items():
            # Count how many days the user spent at least 2 minutes (120s) in this app during this time block
            active_days = sum(1 for dur in dates_durations.values() if dur >= 120)
            
            # Pattern Condition: Active on at least 3 separate days OR active on more than 60% of all logged days
            if active_days >= 3 or (total_days >= 2 and active_days / total_days >= 0.6):
                confidence = round(active_days / total_days, 2)
                block_desc = TIME_BLOCKS[block][2]
                
                # Friendly display name mapping
                app_display = app.replace(".exe", "").capitalize()
                
                description = f"Влад активно запускает {app_display} по {block_desc} (замечено в {active_days} из {total_days} дней)."
                pattern_type = f"{app.lower()}_{block.lower()}"
                
                # 3. Check if pattern already exists in DB
                cursor.execute("SELECT id FROM learned_patterns WHERE pattern_type = ?", (pattern_type,))
                existing = cursor.fetchone()
                
                if existing:
                    # Update confidence and timestamp
                    cursor.execute(
                        "UPDATE learned_patterns SET description = ?, confidence = ?, timestamp = ? WHERE id = ?",
                        (description, confidence, now_str, existing[0])
                    )
                else:
                    # Insert new pattern (disabled/inactive by default until confirmed)
                    cursor.execute(
                        "INSERT INTO learned_patterns (pattern_type, description, confidence, active, timestamp) VALUES (?, ?, ?, 0, ?)",
                        (pattern_type, description, confidence, now_str)
                    )
                patterns_found += 1
                
    conn.commit()
    conn.close()
    return patterns_found

def get_patterns() -> list:
    """Returns a list of all identified habits from the database."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, pattern_type, description, confidence, active FROM learned_patterns ORDER BY confidence DESC")
    rows = cursor.fetchall()
    conn.close()
    
    return [
        {
            "id": r[0],
            "pattern_type": r[1],
            "description": r[2],
            "confidence": r[3],
            "active": r[4]
        }
        for r in rows
    ]

def toggle_pattern(pattern_id: int, active: int):
    """Enables or disables a pattern automation rule."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE learned_patterns SET active = ? WHERE id = ?", (active, pattern_id))
    conn.commit()
    conn.close()
