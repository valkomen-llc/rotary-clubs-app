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
    
    # regex to replace conf-sponsors inner content
    pattern = r'(<div class="conf-sponsors">)(.*?)(</div>)'
    replacement = r'\1\n    <img src="https://rotary-platform-assets.s3.us-east-1.amazonaws.com/clubs/a5868df5-6593-4711-b7e7-ad9936b96faf/images/1776285183540-Sponsors.jpg" alt="Sponsors" style="max-width: 100%; height: auto; border-radius: 8px;"/>\n  \3'
    
    # Use re.sub with re.DOTALL to match newline characters between the tags
    new_html = re.sub(pattern, replacement, html, flags=re.DOTALL)
    
    cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (new_html, event_id))
    conn.commit()
    print("Successfully replaced sponsors text with image!")

if __name__ == "__main__":
    run()
