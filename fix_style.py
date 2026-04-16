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
    
    # Consolidate double styles
    html = html.replace(
        '<h2 style="text-align:center; color:#fff;" style="font-weight: normal; margin-top: 0;">',
        '<h2 style="text-align:center; color:#fff; font-weight: normal; margin-top: 0;">'
    )
    
    # In case there's another variation matching it broadly
    html = re.sub(
        r'<h2\s+style="([^"]*)"\s+style="([^"]*)"\s*>',
        r'<h2 style="\1 \2">',
        html
    )

    cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (html, event_id))
    conn.commit()
    print("Successfully fixed double style attributes on the title!")

if __name__ == "__main__":
    run()
