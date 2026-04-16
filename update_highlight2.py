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
    
    # 1. Update the CSS for conf-highlight so padding is symmetric top and bottom.
    # Currently it might be 'padding: 1.2rem 2rem 2rem 2rem;'
    html = re.sub(
        r'(\.conf-highlight\s*\{[^}]*)padding:\s*[^;]+;([^}]*\})',
        r'\1padding: 1.5rem 2rem;\2',
        html
    )
    
    # Make sure margin-bottom on the ul is zero, so it doesn't add extra space at the bottom
    # Actually the ul has margin:1rem 0 0; already so it only has top margin.
    # The h2 could have margin-bottom, let's set it to 0 just to rely solely on ul padding.
    # But h2 has margin-top: 0
    # Let's ensure <ul style="..."> has margin-bottom: 0
    
    cur.execute('UPDATE "CalendarEvent" SET "htmlContent" = %s WHERE id = %s', (html, event_id))
    conn.commit()
    print("Successfully updated symmetric padding!")

if __name__ == "__main__":
    run()
