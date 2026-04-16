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
    
    # Replace the Programas title
    html = re.sub(
        r'<h2([^>]*)>\s*🗓️ Programas V CONFERENCIA LATIR y IV ROTEX\s*</h2>',
        r'<h2\1 style="font-weight: normal; color: #013388;">🗓️ Programas V CONFERENCIA LATIR y IV ROTEX</h2>',
        html
    )

    # Replace the Puerto Madryn title
    html = re.sub(
        r'<h2([^>]*)>\s*🐋 Disfrutá Puerto Madryn\s*</h2>',
        r'<h2\1 style="font-weight: normal; color: #013388;">🐋 Disfrutá Puerto Madryn</h2>',
        html
    )
    
    cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (html, event_id))
    conn.commit()
    print("Successfully updated titles to remove bold!")

if __name__ == "__main__":
    run()
