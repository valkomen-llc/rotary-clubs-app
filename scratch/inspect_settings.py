import psycopg2
import json

DATABASE_URL = "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"
CLUB_ID = "857498f8-4836-4c5b-95b2-80d8c073edfc"

def run():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        cur.execute('SELECT "siteImages" FROM "Setting" WHERE "clubId" = %s', (CLUB_ID,))
        row = cur.fetchone()
        
        if row:
            print(json.dumps(row[0], indent=2))
        else:
            print("No settings found for this club.")
            
        cur.close()
        conn.close()
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    run()
