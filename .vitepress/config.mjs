import fs from 'fs'
import path from 'path'

function formatTitle(name) {
  return name
    .replace(/^\d+[_-]?/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function getItemsForDir(dir) {
  try {
    const dirPath = path.resolve(process.cwd(), dir)
    if (!fs.existsSync(dirPath)) return []
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'))
    files.sort()
    return files.map((f) => {
      const name = path.basename(f, '.md')
      return { text: formatTitle(name), link: `/${dir}/${name}` }
    })
  } catch (e) {
    return []
  }
}

function copyMarkdownFilesToPublic() {
  const publicRoot = path.resolve(process.cwd(), 'public')
  if (!fs.existsSync(publicRoot)) {
    fs.mkdirSync(publicRoot, { recursive: true })
  }

  const contentDirs = ['01_CheatSheets', '02_Topics', '03_CodeSpikes', '04_AI_Prompts']
  for (const dir of contentDirs) {
    const srcDir = path.resolve(process.cwd(), dir)
    if (!fs.existsSync(srcDir)) continue

    const destDir = path.resolve(publicRoot, dir)
    fs.rmSync(destDir, { recursive: true, force: true })
    fs.mkdirSync(destDir, { recursive: true })

    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.md'))
    for (const file of files) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file))
    }
  }

  const rootMarkdownFiles = fs.readdirSync(process.cwd()).filter((f) => f.endsWith('.md'))
  for (const file of rootMarkdownFiles) {
    fs.copyFileSync(path.resolve(process.cwd(), file), path.resolve(publicRoot, file))
  }
}

copyMarkdownFilesToPublic()

export default {
  title: "Interview Prep",
  description: "20-Year Legacy to Modern .NET Cloud Architect",
  themeConfig: {
    sidebar: [
      {
        text: '01. Cheat Sheets (2-Hour Notice)',
        collapsible: true,
        collapsed: true,
        items: getItemsForDir('01_CheatSheets')
      },
      {
        text: '02. Deep-Dive Topics',
        collapsible: true,
        collapsed: true,
        items: getItemsForDir('02_Topics')
      },
      {
        text: '03. Code Spikes',
        collapsible: true,
        collapsed: true,
        items: getItemsForDir('03_CodeSpikes')
      },
      {
        text: '04. AI Prompts & Context',
        collapsible: true,
        collapsed: true,
        items: getItemsForDir('04_AI_Prompts')
      }
    ]
  }
}