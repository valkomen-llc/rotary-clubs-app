import psycopg2
import json

DATABASE_URL = "postgresql://neondb_owner:npg_WIOzsp6BKEw4@ep-frosty-wildflower-aizkdw2f-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"

def fix_images():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # 1. Get Global S3 URLs
    cur.execute("SELECT content FROM \"ContentSection\" WHERE page = 'home' AND section = 'images' AND \"clubId\" IS NULL")
    global_row = cur.fetchone()
    if not global_row:
        print("Global images not found!")
        return
        
    global_data = global_row[0]
    if isinstance(global_data, str):
        global_data = json.loads(global_data)
        
    global_causes = global_data.get('causes', [])
    if not global_causes:
        print("Global causes not found!")
        return

    print(f"Found {len(global_causes)} global S3 images.")

    # 2. Find all clubs with images
    cur.execute("SELECT \"clubId\", content FROM \"ContentSection\" WHERE page = 'home' AND section = 'images' AND \"clubId\" IS NOT NULL")
    club_rows = cur.fetchall()

    def is_default(url):
        return not url or 'images.unsplash.com' in url or '/defaults/' in url

    updated_count = 0
    for club_id, content in club_rows:
        data = content
        if isinstance(data, str):
            data = json.loads(data)
            
        causes = data.get('causes', [])
        modified = False
        
        # Merge causes
        for i in range(len(global_causes)):
            # If club has more causes than global, we only fix the matching ones
            if i < len(causes):
                c_slot = causes[i]
                g_slot = global_causes[i]
                if is_default(c_slot.get('url')):
                    c_slot['url'] = g_slot['url']
                    # Also copy alt text if it was a generic default
                    if not c_slot.get('alt') or c_slot.get('alt') in ['Promoción de la paz', 'Lucha contra las enfermedades', 'Suministro de agua salubre', 'Mejorando la salud materno-infantil', 'Apoyo a la educación', 'Desarrollo de las economías locales', 'Protección del medioambiente']:
                         c_slot['alt'] = g_slot['alt']
                    modified = True
            elif i < 7: # If missing, append
                causes.append(global_causes[i])
                modified = True
        
        if modified:
            data['causes'] = causes
            # Save back
            cur.execute(
                "UPDATE \"ContentSection\" SET content = %s WHERE page = 'home' AND section = 'images' AND \"clubId\" = %s",
                (json.dumps(data), club_id)
            )
            updated_count += 1
            print(f"Updated club {club_id}")

    conn.commit()
    cur.close()
    conn.close()
    print(f"Successfully updated {updated_count} clubs in the database.")

if __name__ == "__main__":
    fix_images()
