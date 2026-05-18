import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://vuqwnwkdfwqaephpyndk.supabase.co',
  'sb_publishable_jOGIaw_BWgKjAYaGgRbm8Q_NvV1KRnD'
)

async function migrate() {
  // 添加新列
  const { error: e1 } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE todos 
      ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium',
      ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '其他',
      ADD COLUMN IF NOT EXISTS due_date DATE,
      ADD COLUMN IF NOT EXISTS description TEXT;
    `
  })
  if (e1) console.log('Migration note:', e1.message)
  else console.log('Migration done!')
}

migrate()
