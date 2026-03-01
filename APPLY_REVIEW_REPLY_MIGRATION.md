# Apply Review Reply Migration

## Option 1: Using phpMyAdmin or MySQL Workbench

Connect to your Aiven MySQL database and run this SQL:

```sql
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply_date DATETIME;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS replied_by_user_id INT;
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_reply_user 
    FOREIGN KEY (replied_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
```

## Option 2: Using MySQL Command Line

If you have a working mysql client, run:

```bash
mysql -h mysql-35b52f24-exssasha-e8a2.h.aivencloud.com -P 27138 -u avnadmin -p defaultdb < migrations/020_add_review_replies.sql
```

Enter your database password when prompted.

## Option 3: Manual Execution

1. Connect to your Aiven MySQL dashboard: https://console.aiven.io/
2. Navigate to your MySQL service
3. Go to the "Query Editor" or "Tools" section
4. Execute the SQL statements above

## Verification

After running the migration, verify it worked by checking the reviews table:

```sql
DESCRIBE reviews;
```

You should see the new columns: `reply`, `reply_date`, and `replied_by_user_id`.

## What This Enables

Once the migration is applied, users will be able to:
- Reply to reviews on their profile pages
- View replies from other users
- See reply author names and dates

The backend code is already deployed and ready - just needs the database schema update.
