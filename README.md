# Al-Qaddaary Telegram Archive

This is a public archive of older content from **Al-Qaddaary's English Telegram Channel**.

* https://t.me/alQaddaaree_EN

I made this archive so previous posts, translations, files, audio, images, and other shared material remain accessible in a cleaner browsing format.

The main channel is now used more for interaction, announcements, updates, and current activity.

This archive is for readers who still want to access the older material.

## Features

- Searchable posts
- Date and month filtering
- Media filters
- Arabic and English support
- Images, videos, audio, PDFs, and files
- Dark and light mode
- Message links
- Copy post text
- Media hosted through Archive.org

## Notes

The site is static.

It uses:

* HTML
* CSS
* JavaScript
* Telegram export JSON
* Archive.org for media hosting

----

# How This Archive Was Built

This guide explains how the Telegram archive was made.

The setup has three main parts:

1. Export the Telegram channel data.
2. Upload media files to Archive.org.
3. Host the archive website as a static site.

---

## 1. Export the Telegram channel

From Telegram Desktop:

1. Open the channel.
2. Click the menu.
3. Choose **Export chat history**.
4. Export as JSON.
5. Include media if you want images, audio, video, and files to work in the archive.

The export folder may contain files like:

```txt
result.json
photos/
video_files/
files/
stickers/
voice_messages/
images/
````

The important file is:

```txt
result.json
```

That is the raw Telegram export.

---

## 2. Upload media to Archive.org

The website itself should stay light.

So media files are uploaded to Archive.org instead of being stored inside the Git repository.

Install the Internet Archive CLI:

```bash
sudo dnf install pipx
pipx ensurepath
pipx install internetarchive
```

Configure it:

```bash
ia configure
```

Upload the media folders:

```bash
ia upload alqaddari-tg-archive \
  photos/ \
  video_files/ \
  files/ \
  stickers/ \
  voice_messages/ \
  images/
```

If the upload stops or Archive.org rate-limits you, upload missing files slowly.

First create a local list:

```bash
find photos video_files files stickers voice_messages images \
  -type f -printf '%f\n' | sort > local-flat.txt
```

Then create an Archive.org list:

```bash
ia list alqaddari-tg-archive | sort > uploaded.txt
```

Compare them:

```bash
comm -23 local-flat.txt uploaded.txt > missing-flat.txt
```

Upload the missing files slowly:

```bash
while IFS= read -r name; do
  file=$(find photos video_files files stickers voice_messages images -type f -name "$name" | head -1)
  if [ -n "$file" ]; then
    echo "Uploading: $file"
    ia upload alqaddari-tg-archive "$file"
    sleep 12
  else
    echo "Could not find: $name"
  fi
done < missing-flat.txt
```

---

## 3. Process the Telegram JSON

The raw Telegram JSON is not ideal for the frontend.

So it is processed into a cleaner file:

```txt
result.processed.json
```

Run:

```bash
python3 tools/preprocess.py result.json result.processed.json \
  --media-base https://archive.org/download/alqaddari-tg-archive/ \
  --flatten-media
```

This does several things:

* Cleans the message data.
* Converts text into paragraphs.
* Handles Arabic and English paragraph direction.
* Builds Archive.org media URLs.
* Adds searchable text.
* Adds tags for filtering.

The `--flatten-media` option is important because Archive.org stores the uploaded files without their original folder paths.

Example:

```txt
photos/photo_1.jpg
```

becomes:

```txt
https://archive.org/download/alqaddari-tg-archive/photo_1.jpg
```

---

## 4. Run the archive locally

Start a local server:

```bash
python3 -m http.server 8080
```

Open:

```txt
http://localhost:8080
```

Do not open `index.html` directly by double-clicking it, because the browser may block loading the JSON file.

---

## 5. Deploy the archive

The archive is static, so it can be hosted on:

* GitHub Pages
* Vercel
* Netlify
* Any static host

The main files are:

```txt
index.html
styles.css
app.js
result.processed.json
assets/
fonts/
```

Commit and push:

```bash
git add .
git commit -m "Build Telegram archive"
git push
```

---

## 6. Updating the archive later

When you want to update the archive:

1. Export the channel again.
2. Replace `result.json`.
3. Upload any new media files to Archive.org.
4. Regenerate `result.processed.json`.
5. Test locally.
6. Commit and push.

Regenerate:

```bash
python3 tools/preprocess.py result.json result.processed.json \
  --media-base https://archive.org/download/alqaddari-tg-archive/ \
  --flatten-media
```

Test:

```bash
python3 -m http.server 8080
```

Commit:

```bash
git add result.json result.processed.json
git commit -m "Update archive data"
git push
```

---

## Folder structure

A typical project folder looks like this:

```txt
index.html
styles.css
app.js
result.json
result.processed.json
assets/
  logo.jpg
fonts/
  Cinzel-VariableFont_wght.ttf
  Lateef-Regular.ttf
  Lateef-Bold.ttf
  AmiriQuran-Regular.ttf
tools/
  preprocess.py
```

---

## Summary

The archive works by turning a Telegram JSON export into a static website, while storing large media files on Archive.org.

Telegram provides the exported content.
Archive.org stores the media.
The static site presents everything in a searchable archive.
