import psycopg2
import re

DATABASE_URL = "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"

def run():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    event_id = '2038324a-0e04-497c-9328-fbaeb9ce2992'
    cur.execute('SELECT "htmlContent" FROM "CalendarEvent" WHERE id = %s', (event_id,))
    row = cur.fetchone()
    if not row:
        print("Event not found")
        return
        
    html = row[0]
    
    # Let's change the css for .conf-card img
    # Current: .conf-card img { width: 100%; height: 120px; object-fit: cover; border-radius: 10px; margin-bottom: 0.75rem; }
    # New: .conf-card img { width: 100%; height: auto; aspect-ratio: 4/3; object-fit: contain; border-radius: 10px; margin-bottom: 0.75rem; background: #000; }
    # Or just remove the fixed height so it respects the image's actual size.
    
    # We will use re.sub to replace the height
    html = re.sub(r'\.conf-card img \{[^}]*\}', '.conf-card img { width: 100%; height: auto; border-radius: 10px; margin-bottom: 1rem; object-fit: contain; }', html)
    
    cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (html, event_id))
    conn.commit()
    print("Successfully updated image size for cards!")

if __name__ == "__main__":
    run()
