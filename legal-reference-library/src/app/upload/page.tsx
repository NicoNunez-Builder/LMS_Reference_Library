'use client'

import { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SourceType } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { HierarchicalCategorySelector } from '@/components/HierarchicalCategorySelector'
import { Progress } from '@/components/ui/progress'
import { X, Upload, Loader2, Link, Download } from 'lucide-react'

interface UploadedFile {
  file: File
  preview?: string
  uploading: boolean
  uploaded: boolean
  error?: string
  url?: string
}

interface ArchiveFileEntry {
  name: string
  path: string
  size: number
  type: string
  sourceType: string
  selected: boolean
}

interface ArchivePreview {
  archiveName: string
  archiveType: 'zip' | 'targz' | 'tar'
  totalFiles: number
  skippedFiles: number
  files: ArchiveFileEntry[]
  skipped: string[]
}

export default function UploadPage() {
  // Standard upload state
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [sourceType, setSourceType] = useState<string>(SourceType.PDF)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0)
  const [successMessage, setSuccessMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Archive upload state (ZIP and TAR.GZ)
  const [archiveFile, setArchiveFile] = useState<File | null>(null)
  const [archivePreview, setArchivePreview] = useState<ArchivePreview | null>(null)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveUploading, setArchiveUploading] = useState(false)
  const [archiveUploadProgress, setArchiveUploadProgress] = useState(0)
  const [archiveCategory, setArchiveCategory] = useState('')
  const [archiveResult, setArchiveResult] = useState<{
    uploaded: number
    failed: number
    message: string
  } | null>(null)
  const archiveInputRef = useRef<HTMLInputElement>(null)

  // URL upload state
  const [pdfUrl, setPdfUrl] = useState('')
  const [urlFetching, setUrlFetching] = useState(false)
  const [urlFetched, setUrlFetched] = useState(false)
  const [urlFileInfo, setUrlFileInfo] = useState<{
    file_url: string
    file_size: number
    content_type: string | null
    scraped?: boolean
  } | null>(null)
  const [urlTitle, setUrlTitle] = useState('')
  const [urlDescription, setUrlDescription] = useState('')
  const [urlCategory, setUrlCategory] = useState('')
  const [urlSourceType, setUrlSourceType] = useState<string>(SourceType.PDF)
  const [urlSubmitting, setUrlSubmitting] = useState(false)
  const [urlSuccessMessage, setUrlSuccessMessage] = useState('')
  const [urlError, setUrlError] = useState('')

  // Active tab
  const [activeTab, setActiveTab] = useState('single')

  // Helper function to format title from filename
  const formatTitleFromFileName = (fileName: string): string => {
    // Remove extension
    let name = fileName.replace(/\.[^/.]+$/, '')

    // Replace common separators with spaces
    name = name.replace(/[-_]+/g, ' ')

    // Add spaces before capital letters (camelCase/PascalCase)
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2')

    // Add spaces around numbers
    name = name.replace(/(\d+)/g, ' $1 ')

    // Clean up multiple spaces and trim
    name = name.replace(/\s+/g, ' ').trim()

    // Capitalize first letter of each word
    name = name.replace(/\b\w/g, (char) => char.toUpperCase())

    return name
  }

  // Helper function to generate description from file info
  const generateDescription = (file: File, sourceType: string, formattedTitle: string): string => {
    const ext = file.name.split('.').pop()?.toUpperCase() || ''
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2)
    const sizeInKB = (file.size / 1024).toFixed(1)
    const sizeStr = file.size > 1024 * 1024 ? `${sizeInMB} MB` : `${sizeInKB} KB`
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    // Generate a more descriptive template based on file type
    switch (sourceType) {
      case SourceType.PDF:
        return `${formattedTitle} - A PDF document containing legal reference material. File size: ${sizeStr}. Added to library on ${today}.`
      case SourceType.DOCUMENT:
        return `${formattedTitle} - A ${ext} document for legal research and reference. File size: ${sizeStr}. Added on ${today}.`
      case SourceType.EBOOK:
        return `${formattedTitle} - An electronic book (${ext}) available for reading and reference. File size: ${sizeStr}. Added on ${today}.`
      case SourceType.VIDEO:
        return `${formattedTitle} - A video resource (${ext}, ${sizeStr}) for legal education and training. Added on ${today}.`
      case SourceType.ARTICLE:
        return `${formattedTitle} - An article for legal research and analysis. File size: ${sizeStr}. Added on ${today}.`
      default:
        return `${formattedTitle} - A resource file (${ext}, ${sizeStr}) added to the library on ${today}.`
    }
  }

  // Helper function to detect source type from file
  const detectSourceType = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'pdf':
        return SourceType.PDF
      case 'doc':
      case 'docx':
      case 'txt':
      case 'rtf':
        return SourceType.DOCUMENT
      case 'epub':
      case 'mobi':
      case 'azw':
      case 'azw3':
        return SourceType.EBOOK
      case 'mp4':
      case 'webm':
      case 'mov':
      case 'avi':
      case 'mkv':
        return SourceType.VIDEO
      default:
        return SourceType.DOCUMENT
    }
  }

  // Auto-fill all fields from file
  const autoFillFromFile = (file: File) => {
    const detectedType = detectSourceType(file.name)
    const formattedTitle = formatTitleFromFileName(file.name)

    // Always update title if empty
    if (!title) {
      setTitle(formattedTitle)
    }

    // Always update description if empty
    if (!description) {
      setDescription(generateDescription(file, detectedType, formattedTitle))
    }

    // Always update source type
    setSourceType(detectedType)
  }

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false)
  const [isArchiveDragging, setIsArchiveDragging] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length === 0) return

    // Filter to only accepted file types
    const acceptedExtensions = ['pdf', 'doc', 'docx', 'epub', 'mobi', 'mp4', 'webm', 'mov', 'txt', 'rtf', 'azw', 'azw3', 'avi', 'mkv']
    const validFiles = droppedFiles.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase()
      return ext && acceptedExtensions.includes(ext)
    })

    if (validFiles.length === 0) {
      alert('No valid files found. Supported formats: PDF, DOC, DOCX, EPUB, MOBI, MP4, WEBM, MOV')
      return
    }

    const newFiles: UploadedFile[] = validFiles.map((file) => ({
      file,
      uploading: false,
      uploaded: false,
    }))
    setFiles((prev) => [...prev, ...newFiles])

    // Auto-fill from first file
    if (validFiles.length > 0) {
      autoFillFromFile(validFiles[0])
    }
  }

  const handleArchiveDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsArchiveDragging(true)
  }

  const handleArchiveDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsArchiveDragging(false)
  }

  const handleArchiveDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsArchiveDragging(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    if (droppedFiles.length === 0) return

    const file = droppedFiles[0]
    if (!isValidArchive(file.name)) {
      alert('Please drop a ZIP or TAR.GZ file')
      return
    }

    // Process the archive file
    setArchiveFile(file)
    setArchivePreview(null)
    setArchiveResult(null)
    setArchiveLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mode', 'preview')

      const response = await fetch('/api/upload-archive', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.error) {
        alert(`Error: ${data.error}`)
        setArchiveFile(null)
        return
      }

      setArchivePreview({
        archiveName: data.archiveName,
        archiveType: data.archiveType,
        totalFiles: data.totalFiles,
        skippedFiles: data.skippedFiles,
        files: data.files.map((f: Omit<ArchiveFileEntry, 'selected'>) => ({ ...f, selected: true })),
        skipped: data.skipped || [],
      })
    } catch (error) {
      console.error('Archive preview error:', error)
      alert('Failed to preview archive')
      setArchiveFile(null)
    } finally {
      setArchiveLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const newFiles: UploadedFile[] = selectedFiles.map((file) => ({
      file,
      uploading: false,
      uploaded: false,
    }))
    setFiles((prev) => [...prev, ...newFiles])

    // Auto-fill from first file
    if (selectedFiles.length > 0) {
      autoFillFromFile(selectedFiles[0])
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadFile = async (file: File): Promise<string | null> => {
    const supabase = createClient()

    // Determine folder based on file type
    const ext = file.name.split('.').pop()?.toLowerCase()
    let folder = 'documents'
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext || '')) {
      folder = 'videos'
    }

    // Generate unique filename
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `${folder}/${timestamp}_${safeName}`

    const { data, error } = await supabase.storage
      .from('staging_library')
      .upload(filePath, file)

    if (error) {
      console.error('Upload error:', error)
      return null
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('staging_library')
      .getPublicUrl(filePath)

    return urlData.publicUrl
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (files.length === 0) {
      alert('Please select at least one file to upload')
      return
    }

    if (!title.trim()) {
      alert('Please enter a title')
      return
    }

    if (!category) {
      alert('Please select a category')
      return
    }

    setIsSubmitting(true)
    setSuccessMessage('')
    setUploadProgress(0)
    setCurrentUploadIndex(0)

    try {
      // Upload files to Supabase Storage
      const uploadedUrls: string[] = []

      for (let i = 0; i < files.length; i++) {
        setCurrentUploadIndex(i + 1)
        setUploadProgress(Math.round(((i) / files.length) * 100))
        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, uploading: true } : f))
        )

        const url = await uploadFile(files[i].file)

        if (url) {
          uploadedUrls.push(url)
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i ? { ...f, uploading: false, uploaded: true, url } : f
            )
          )
          // Update progress after successful upload
          setUploadProgress(Math.round(((i + 1) / files.length) * 100))
        } else {
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i
                ? { ...f, uploading: false, error: 'Upload failed' }
                : f
            )
          )
        }
      }

      if (uploadedUrls.length === 0) {
        alert('Failed to upload files')
        setIsSubmitting(false)
        return
      }

      // Create resource in database
      const response = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          url: uploadedUrls[0], // Primary file URL
          file_url: uploadedUrls[0],
          file_size: files[0].file.size,
          category_id: category,
          source_type: sourceType,
          is_public: true,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create resource')
      }

      setSuccessMessage('Resource uploaded successfully!')

      // Reset form
      setFiles([])
      setTitle('')
      setDescription('')
      setCategory('')
      setSourceType(SourceType.PDF)
      setUploadProgress(0)
      setCurrentUploadIndex(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Submit error:', error)
      alert(error instanceof Error ? error.message : 'Failed to upload resource')
    } finally {
      setIsSubmitting(false)
      setUploadProgress(0)
      setCurrentUploadIndex(0)
    }
  }

  // Archive file handling (ZIP and TAR.GZ)
  const isValidArchive = (filename: string): boolean => {
    const lower = filename.toLowerCase()
    return lower.endsWith('.zip') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')
  }

  const handleArchiveSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!isValidArchive(file.name)) {
      alert('Please select a ZIP or TAR.GZ file')
      return
    }

    setArchiveFile(file)
    setArchivePreview(null)
    setArchiveResult(null)
    setArchiveLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mode', 'preview')

      const response = await fetch('/api/upload-archive', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.error) {
        alert(`Error: ${data.error}`)
        setArchiveFile(null)
        return
      }

      setArchivePreview({
        archiveName: data.archiveName,
        archiveType: data.archiveType,
        totalFiles: data.totalFiles,
        skippedFiles: data.skippedFiles,
        files: data.files.map((f: Omit<ArchiveFileEntry, 'selected'>) => ({ ...f, selected: true })),
        skipped: data.skipped || [],
      })
    } catch (error) {
      console.error('Archive preview error:', error)
      alert('Failed to preview archive')
      setArchiveFile(null)
    } finally {
      setArchiveLoading(false)
    }
  }

  const toggleArchiveFileSelection = (index: number) => {
    if (!archivePreview) return
    setArchivePreview({
      ...archivePreview,
      files: archivePreview.files.map((f, i) =>
        i === index ? { ...f, selected: !f.selected } : f
      ),
    })
  }

  const toggleAllArchiveFiles = () => {
    if (!archivePreview) return
    const allSelected = archivePreview.files.every((f) => f.selected)
    setArchivePreview({
      ...archivePreview,
      files: archivePreview.files.map((f) => ({ ...f, selected: !allSelected })),
    })
  }

  const handleArchiveUpload = async () => {
    if (!archiveFile || !archiveCategory || !archivePreview) {
      alert('Please select a category')
      return
    }

    const selectedFiles = archivePreview.files.filter((f) => f.selected)
    if (selectedFiles.length === 0) {
      alert('Please select at least one file to upload')
      return
    }

    setArchiveUploading(true)
    setArchiveResult(null)
    setArchiveUploadProgress(0)

    // Simulate progress while server processes
    const progressInterval = setInterval(() => {
      setArchiveUploadProgress((prev) => {
        if (prev >= 90) return prev // Cap at 90% until complete
        return prev + Math.random() * 10
      })
    }, 500)

    try {
      const formData = new FormData()
      formData.append('file', archiveFile)
      formData.append('mode', 'upload')
      formData.append('category_id', archiveCategory)
      formData.append('selected_files', JSON.stringify(selectedFiles.map(f => f.path)))

      const response = await fetch('/api/upload-archive', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setArchiveUploadProgress(100)

      const data = await response.json()

      if (data.error) {
        alert(`Error: ${data.error}`)
        return
      }

      setArchiveResult({
        uploaded: data.uploaded,
        failed: data.failed,
        message: data.message,
      })

      // Reset archive state
      setArchiveFile(null)
      setArchivePreview(null)
      setArchiveCategory('')
      if (archiveInputRef.current) {
        archiveInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Archive upload error:', error)
      alert('Failed to upload archive contents')
      clearInterval(progressInterval)
    } finally {
      setArchiveUploading(false)
      setArchiveUploadProgress(0)
    }
  }

  // Helper to extract title from document text
  const extractTitleFromText = (text: string): string | null => {
    if (!text) return null

    // Split into lines and clean
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)

    if (lines.length === 0) return null

    // For legal documents: Look for case caption patterns
    const fullText = lines.slice(0, 50).join(' ')

    // Pattern 1: "X v. Y" or "X vs. Y" case names
    const vsMatch = fullText.match(/([A-Z][A-Z\s\d\.]+(?:,\s*)?)\s+(?:v\.|vs\.?|versus)\s+([A-Z][A-Z\s\d\.,]+?)(?:,|\s+Defendant|\s+et al)/i)
    if (vsMatch) {
      const plaintiff = vsMatch[1].replace(/,\s*$/, '').trim()
      const defendant = vsMatch[2].replace(/,\s*$/, '').trim()
      // Look for document type
      const docTypeMatch = fullText.match(/\b(COMPLAINT|MOTION|ORDER|MEMORANDUM|BRIEF|PETITION|RESPONSE|REPLY|JUDGMENT|OPINION|INDICTMENT|AFFIDAVIT|DECLARATION|SUBPOENA)\b/i)
      const docType = docTypeMatch ? docTypeMatch[1] : ''
      if (docType) {
        return `${plaintiff} v. ${defendant} - ${docType.charAt(0).toUpperCase() + docType.slice(1).toLowerCase()}`
      }
      return `${plaintiff} v. ${defendant}`
    }

    // Pattern 2: Court filing with case number
    const caseNoMatch = fullText.match(/(?:Case|Civil Action|Docket|No\.?|#)\s*[:.]?\s*([\d\-:]+(?:cv|cr|mc)?[\d\-]*)/i)
    const courtMatch = fullText.match(/((?:UNITED STATES )?(?:DISTRICT|CIRCUIT|BANKRUPTCY|SUPREME) COURT[^,\n]*)/i)

    // Pattern 3: Document type as title
    const docTypes = ['COMPLAINT', 'MOTION', 'ORDER', 'MEMORANDUM', 'BRIEF', 'PETITION',
                      'RESPONSE', 'REPLY', 'JUDGMENT', 'OPINION', 'INDICTMENT', 'AFFIDAVIT',
                      'DECLARATION', 'SUBPOENA', 'NOTICE', 'STIPULATION', 'ANSWER']
    for (const docType of docTypes) {
      const regex = new RegExp(`\\b${docType}\\b`, 'i')
      if (regex.test(fullText)) {
        // Try to get more context
        if (courtMatch && caseNoMatch) {
          return `${docType.charAt(0).toUpperCase() + docType.slice(1).toLowerCase()} - Case ${caseNoMatch[1]}`
        }
        // Look for plaintiff name
        const plaintiffMatch = fullText.match(/([A-Z][A-Z\s]+),?\s*Plaintiff/i)
        if (plaintiffMatch) {
          return `${plaintiffMatch[1].trim()} - ${docType.charAt(0).toUpperCase() + docType.slice(1).toLowerCase()}`
        }
      }
    }

    // Pattern 4: Standard title extraction for non-legal documents
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const line = lines[i]

      // Skip very short lines or lines that look like headers/numbers
      if (line.length < 5) continue
      if (/^[\d\.\-\s]+$/.test(line)) continue
      if (/^(page|chapter|section|table of contents)/i.test(line)) continue
      // Skip court location lines
      if (/^(UNITED STATES|SOUTHERN|NORTHERN|EASTERN|WESTERN|CENTRAL)\s+(DISTRICT|DIVISION)/i.test(line)) continue

      // Good title candidate: reasonable length
      if (line.length >= 10 && line.length <= 200) {
        // Clean up the title
        let title = line
          .replace(/^[\d\.\s\-:]+/, '') // Remove leading numbers/dots
          .replace(/\s+/g, ' ')
          .trim()

        // Capitalize first letter if needed
        if (title.length > 0 && /^[a-z]/.test(title)) {
          title = title.charAt(0).toUpperCase() + title.slice(1)
        }

        if (title.length >= 5) {
          return title
        }
      }
    }

    // Fallback: combine first few meaningful lines
    const meaningfulLines = lines.slice(0, 5).filter(l => l.length > 3)
    if (meaningfulLines.length > 0) {
      return meaningfulLines.slice(0, 2).join(' - ').substring(0, 150)
    }

    return null
  }

  // Helper to generate description from document text
  const generateDescriptionFromText = (text: string, pageCount?: number, wordCount?: number): string => {
    if (!text) return ''

    // Clean the text
    const cleanText = text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim()

    // Get first meaningful paragraph (skip very short sections)
    const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 20)

    // Take first 2-3 sentences for description
    let description = ''
    for (let i = 0; i < Math.min(3, sentences.length); i++) {
      const sentence = sentences[i].trim()
      if (description.length + sentence.length > 400) break
      description += sentence + '. '
    }

    description = description.trim()

    // If still too short, just take the first 300 chars
    if (description.length < 50 && cleanText.length > 50) {
      description = cleanText.substring(0, 300).trim()
      // Try to end at a word boundary
      const lastSpace = description.lastIndexOf(' ')
      if (lastSpace > 200) {
        description = description.substring(0, lastSpace) + '...'
      }
    }

    // Add metadata suffix
    const metadata: string[] = []
    if (pageCount) metadata.push(`${pageCount} pages`)
    if (wordCount) metadata.push(`${wordCount.toLocaleString()} words`)

    if (metadata.length > 0) {
      description += ` (${metadata.join(', ')})`
    }

    return description
  }

  // URL upload handling
  const handleUrlFetch = async () => {
    if (!pdfUrl.trim()) {
      setUrlError('Please enter a URL')
      return
    }

    // Validate URL format
    try {
      new URL(pdfUrl)
    } catch {
      setUrlError('Please enter a valid URL')
      return
    }

    setUrlFetching(true)
    setUrlError('')
    setUrlFetched(false)
    setUrlFileInfo(null)
    setUrlSuccessMessage('')

    try {
      // Extract title from URL for the download request
      const urlPath = new URL(pdfUrl).pathname
      const urlFilename = urlPath.split('/').pop() || 'document'
      const titleFromUrl = formatTitleFromFileName(urlFilename)

      const response = await fetch('/api/resources/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: pdfUrl,
          title: titleFromUrl,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.reason || 'Failed to fetch file')
      }

      if (data.success) {
        setUrlFileInfo({
          file_url: data.file_url,
          file_size: data.file_size,
          content_type: data.content_type,
          scraped: data.scraped,
        })
        setUrlFetched(true)

        // Detect source type from content type
        if (data.content_type) {
          if (data.content_type.includes('pdf')) {
            setUrlSourceType(SourceType.PDF)
          } else if (data.content_type.includes('video')) {
            setUrlSourceType(SourceType.VIDEO)
          } else if (data.content_type.includes('epub')) {
            setUrlSourceType(SourceType.EBOOK)
          } else {
            setUrlSourceType(SourceType.DOCUMENT)
          }
        }

        // Parse document to extract title and description from content
        // Use the Supabase file URL (already downloaded) instead of original URL
        const fileUrlToParse = data.file_url || pdfUrl
        console.log('Attempting to parse document from:', fileUrlToParse)

        try {
          const formData = new FormData()
          formData.append('url', fileUrlToParse)

          const parseResponse = await fetch('/api/parse-document', {
            method: 'POST',
            body: formData,
          })

          console.log('Parse response status:', parseResponse.status)
          const parseData = await parseResponse.json()
          console.log('Parse response data:', parseData)

          if (parseResponse.ok && parseData.success && parseData.text) {
            console.log('Parse successful, text length:', parseData.text.length)
            console.log('First 500 chars:', parseData.text.substring(0, 500))

            // Extract title from document content
            const extractedTitle = extractTitleFromText(parseData.text)
            console.log('Extracted title:', extractedTitle)

            if (extractedTitle) {
              setUrlTitle(extractedTitle)
            } else {
              setUrlTitle(titleFromUrl)
            }

            // Generate description from document content
            const extractedDescription = generateDescriptionFromText(
              parseData.text,
              parseData.stats?.pages,
              parseData.stats?.wordCount
            )
            console.log('Extracted description:', extractedDescription)

            if (extractedDescription) {
              setUrlDescription(extractedDescription)
            }
          } else {
            // Parsing didn't return text, use URL-based title/description
            console.log('Parse failed or no text. Error:', parseData.error)
            setUrlTitle(titleFromUrl)
            const sizeStr = data.file_size > 1024 * 1024
              ? `${(data.file_size / (1024 * 1024)).toFixed(2)} MB`
              : `${(data.file_size / 1024).toFixed(1)} KB`
            setUrlDescription(`Document downloaded from URL. File size: ${sizeStr}.`)
          }
        } catch (parseError) {
          console.error('Document parsing exception:', parseError)
          // Fallback to URL-based title/description
          setUrlTitle(titleFromUrl)
          const sizeStr = data.file_size > 1024 * 1024
            ? `${(data.file_size / (1024 * 1024)).toFixed(2)} MB`
            : `${(data.file_size / 1024).toFixed(1)} KB`
          setUrlDescription(`Document downloaded from URL. File size: ${sizeStr}.`)
        }
      }
    } catch (error) {
      console.error('URL fetch error:', error)
      setUrlError(error instanceof Error ? error.message : 'Failed to fetch file from URL')
    } finally {
      setUrlFetching(false)
    }
  }

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!urlFileInfo) {
      setUrlError('Please fetch a file first')
      return
    }

    if (!urlTitle.trim()) {
      setUrlError('Please enter a title')
      return
    }

    if (!urlCategory) {
      setUrlError('Please select a category')
      return
    }

    setUrlSubmitting(true)
    setUrlError('')

    try {
      // Create resource in database
      const response = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: urlTitle,
          description: urlDescription,
          url: pdfUrl, // Original URL
          file_url: urlFileInfo.file_url,
          file_size: urlFileInfo.file_size,
          category_id: urlCategory,
          source_type: urlSourceType,
          is_public: true,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create resource')
      }

      setUrlSuccessMessage('Resource uploaded successfully from URL!')

      // Reset form
      setPdfUrl('')
      setUrlTitle('')
      setUrlDescription('')
      setUrlCategory('')
      setUrlSourceType(SourceType.PDF)
      setUrlFetched(false)
      setUrlFileInfo(null)
    } catch (error) {
      console.error('URL submit error:', error)
      setUrlError(error instanceof Error ? error.message : 'Failed to save resource')
    } finally {
      setUrlSubmitting(false)
    }
  }

  const resetUrlForm = () => {
    setPdfUrl('')
    setUrlTitle('')
    setUrlDescription('')
    setUrlCategory('')
    setUrlSourceType(SourceType.PDF)
    setUrlFetched(false)
    setUrlFileInfo(null)
    setUrlError('')
    setUrlSuccessMessage('')
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  }

  const getFileIcon = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'pdf':
        return '📄'
      case 'doc':
      case 'docx':
        return '📝'
      case 'epub':
      case 'mobi':
        return '📚'
      case 'mp4':
      case 'webm':
      case 'mov':
        return '🎬'
      case 'zip':
        return '📦'
      default:
        return '📎'
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Upload Resource</h1>
        <p className="text-muted-foreground text-lg">
          Upload PDFs, documents, ebooks, videos, or ZIP archives to your library
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="single">Single File</TabsTrigger>
          <TabsTrigger value="url">From URL</TabsTrigger>
          <TabsTrigger value="archive">Archive (ZIP/TAR.GZ)</TabsTrigger>
        </TabsList>

        {/* Single File Upload Tab */}
        <TabsContent value="single">
          <form onSubmit={handleSubmit}>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>File Upload</CardTitle>
                <CardDescription>
                  Select files to upload. Supported formats: PDF, DOC, DOCX, EPUB, MOBI, MP4, WEBM
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File Input */}
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.epub,.mobi,.mp4,.webm,.mov"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <span className="text-4xl mb-2">{isDragging ? '📥' : '📁'}</span>
                    <span className="text-lg font-medium">
                      {isDragging ? 'Drop files here' : 'Click to select files'}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      or drag and drop
                    </span>
                  </label>
                </div>

                {/* File List */}
                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((f, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{getFileIcon(f.file.name)}</span>
                          <div>
                            <p className="font-medium truncate max-w-xs">
                              {f.file.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatFileSize(f.file.size)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {f.uploading && (
                            <Badge variant="secondary">Uploading...</Badge>
                          )}
                          {f.uploaded && (
                            <Badge variant="default">Uploaded</Badge>
                          )}
                          {f.error && (
                            <Badge variant="destructive">{f.error}</Badge>
                          )}
                          {!f.uploading && !f.uploaded && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(index)}
                            >
                              X
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upload Button and Progress - Visible at top */}
            <Card className="mb-6 border-primary/50 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex flex-col gap-4">
                  {/* Upload Button */}
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isSubmitting || files.length === 0}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Uploading {currentUploadIndex} of {files.length}...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-5 w-5" />
                        Upload Resource
                      </>
                    )}
                  </Button>

                  {/* Progress Bar */}
                  {isSubmitting && (
                    <div className="space-y-2">
                      <Progress value={uploadProgress} showLabel />
                      <p className="text-sm text-muted-foreground text-center">
                        Uploading file {currentUploadIndex} of {files.length}...
                      </p>
                    </div>
                  )}

                  {/* Requirements hint */}
                  {!isSubmitting && files.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center">
                      Select files above, fill in details below, then click upload
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Resource Details</CardTitle>
                <CardDescription>
                  Provide information about the resource
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <div className="relative">
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Enter resource title"
                      required
                      className="pr-8"
                    />
                    {title && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
                        onClick={() => setTitle('')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description">Description</Label>
                    {description && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setDescription('')}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter a description of the resource"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Resource Type</Label>
                  <Select value={sourceType} onValueChange={setSourceType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SourceType.PDF}>PDF</SelectItem>
                      <SelectItem value={SourceType.DOCUMENT}>Document</SelectItem>
                      <SelectItem value={SourceType.EBOOK}>Ebook</SelectItem>
                      <SelectItem value={SourceType.VIDEO}>Video</SelectItem>
                      <SelectItem value={SourceType.ARTICLE}>Article</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Category *</CardTitle>
                <CardDescription>
                  Select the category for this resource
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HierarchicalCategorySelector
                  value={category}
                  onChange={(categoryId) => setCategory(categoryId)}
                  mode="select"
                />
              </CardContent>
            </Card>

            {successMessage && (
              <Card className="mb-6 border-green-500 bg-green-50 dark:bg-green-950">
                <CardContent className="py-4 text-center text-green-700 dark:text-green-300">
                  {successMessage}
                </CardContent>
              </Card>
            )}
          </form>
        </TabsContent>

        {/* URL Upload Tab */}
        <TabsContent value="url">
          <form onSubmit={handleUrlSubmit}>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link className="h-5 w-5" />
                  Upload from URL
                </CardTitle>
                <CardDescription>
                  Enter a URL to a PDF or document file to download and add to your library
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* URL Input */}
                <div className="space-y-2">
                  <Label htmlFor="pdf-url">File URL *</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="pdf-url"
                        type="url"
                        value={pdfUrl}
                        onChange={(e) => {
                          setPdfUrl(e.target.value)
                          setUrlError('')
                          setUrlFetched(false)
                          setUrlFileInfo(null)
                        }}
                        placeholder="https://example.com/document.pdf"
                        disabled={urlFetching || urlFetched}
                        className="pr-8"
                      />
                      {pdfUrl && !urlFetched && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
                          onClick={() => {
                            setPdfUrl('')
                            setUrlError('')
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {!urlFetched ? (
                      <Button
                        type="button"
                        onClick={handleUrlFetch}
                        disabled={urlFetching || !pdfUrl.trim()}
                      >
                        {urlFetching ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Fetching...
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-4 w-4" />
                            Fetch File
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={resetUrlForm}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Change URL
                      </Button>
                    )}
                  </div>
                </div>

                {/* Error message */}
                {urlError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                    {urlError}
                  </div>
                )}

                {/* File info after fetch */}
                {urlFetched && urlFileInfo && (
                  <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {urlFileInfo.scraped ? '📝' : urlFileInfo.content_type?.includes('pdf') ? '📄' : '📎'}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium text-green-800 dark:text-green-200">
                          {urlFileInfo.scraped ? 'Content scraped successfully' : 'File downloaded successfully'}
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Size: {formatFileSize(urlFileInfo.file_size)}
                          {urlFileInfo.content_type && !urlFileInfo.scraped && ` • Type: ${urlFileInfo.content_type.split('/').pop()}`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upload Button - Visible after fetch */}
            {urlFetched && urlFileInfo && (
              <Card className="mb-6 border-primary/50 bg-primary/5">
                <CardContent className="py-4">
                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={urlSubmitting || !urlCategory}
                  >
                    {urlSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Saving to Library...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-5 w-5" />
                        Add to Library
                      </>
                    )}
                  </Button>
                  {!urlCategory && (
                    <p className="text-sm text-muted-foreground text-center mt-2">
                      Please select a category below
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Resource Details - after fetch */}
            {urlFetched && urlFileInfo && (
              <>
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle>Resource Details</CardTitle>
                    <CardDescription>
                      Review and edit the resource information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="url-title">Title *</Label>
                      <div className="relative">
                        <Input
                          id="url-title"
                          value={urlTitle}
                          onChange={(e) => setUrlTitle(e.target.value)}
                          placeholder="Enter resource title"
                          required
                          className="pr-8"
                        />
                        {urlTitle && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
                            onClick={() => setUrlTitle('')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="url-description">Description</Label>
                        {urlDescription && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => setUrlDescription('')}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Clear
                          </Button>
                        )}
                      </div>
                      <Textarea
                        id="url-description"
                        value={urlDescription}
                        onChange={(e) => setUrlDescription(e.target.value)}
                        placeholder="Enter a description of the resource"
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Resource Type</Label>
                      <Select value={urlSourceType} onValueChange={setUrlSourceType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SourceType.PDF}>PDF</SelectItem>
                          <SelectItem value={SourceType.DOCUMENT}>Document</SelectItem>
                          <SelectItem value={SourceType.EBOOK}>Ebook</SelectItem>
                          <SelectItem value={SourceType.VIDEO}>Video</SelectItem>
                          <SelectItem value={SourceType.ARTICLE}>Article</SelectItem>
                          <SelectItem value={SourceType.WEBSITE}>Website</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle>Category *</CardTitle>
                    <CardDescription>
                      Select the category for this resource
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <HierarchicalCategorySelector
                      value={urlCategory}
                      onChange={(categoryId) => setUrlCategory(categoryId)}
                      mode="select"
                    />
                  </CardContent>
                </Card>
              </>
            )}

            {urlSuccessMessage && (
              <Card className="mb-6 border-green-500 bg-green-50 dark:bg-green-950">
                <CardContent className="py-4 text-center text-green-700 dark:text-green-300">
                  {urlSuccessMessage}
                </CardContent>
              </Card>
            )}
          </form>
        </TabsContent>

        {/* Archive Upload Tab (ZIP and TAR.GZ) */}
        <TabsContent value="archive">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Upload Archive</CardTitle>
              <CardDescription>
                Upload a ZIP or TAR.GZ file to extract and add multiple documents at once.
                Supported: PDF, DOC, DOCX, EPUB, MOBI, MP4, WEBM, XLS, XLSX, PPT, PPTX, TXT, MD
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Archive Input */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isArchiveDragging
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
                onDragOver={handleArchiveDragOver}
                onDragLeave={handleArchiveDragLeave}
                onDrop={handleArchiveDrop}
              >
                <input
                  ref={archiveInputRef}
                  type="file"
                  accept=".zip,.tar.gz,.tgz,.tar"
                  onChange={handleArchiveSelect}
                  className="hidden"
                  id="archive-upload"
                />
                <label
                  htmlFor="archive-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <span className="text-4xl mb-2">{isArchiveDragging ? '📥' : '📦'}</span>
                  <span className="text-lg font-medium">
                    {isArchiveDragging ? 'Drop archive here' : 'Click to select archive file'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Supports .zip, .tar.gz, .tgz, and .tar formats
                  </span>
                </label>
              </div>

              {/* Loading state */}
              {archiveLoading && (
                <div className="text-center py-4">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                  <p className="text-muted-foreground">Reading archive contents...</p>
                </div>
              )}

              {/* Archive Preview */}
              {archivePreview && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{archivePreview.archiveName}</p>
                      <p className="text-sm text-muted-foreground">
                        {archivePreview.totalFiles} supported files found
                        {archivePreview.skippedFiles > 0 && ` (${archivePreview.skippedFiles} skipped)`}
                        <Badge variant="secondary" className="ml-2">
                          {archivePreview.archiveType.toUpperCase()}
                        </Badge>
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={toggleAllArchiveFiles}>
                      {archivePreview.files.every((f) => f.selected) ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>

                  {/* File list */}
                  <div className="max-h-80 overflow-y-auto space-y-2 border rounded-lg p-2">
                    {archivePreview.files.map((file, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer ${
                          file.selected ? 'bg-muted' : ''
                        }`}
                        onClick={() => toggleArchiveFileSelection(index)}
                      >
                        <Checkbox
                          checked={file.selected}
                          onCheckedChange={() => toggleArchiveFileSelection(index)}
                        />
                        <span className="text-xl">{getFileIcon(file.name)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {file.path !== file.name ? file.path : ''} • {formatFileSize(file.size)}
                          </p>
                        </div>
                        <Badge variant="outline">{file.type}</Badge>
                      </div>
                    ))}
                  </div>

                  {/* Skipped files */}
                  {archivePreview.skipped.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground">
                        {archivePreview.skipped.length} unsupported files skipped
                      </summary>
                      <ul className="mt-2 pl-4 space-y-1 text-muted-foreground">
                        {archivePreview.skipped.slice(0, 10).map((file, i) => (
                          <li key={i} className="truncate">{file}</li>
                        ))}
                        {archivePreview.skipped.length > 10 && (
                          <li>... and {archivePreview.skipped.length - 10} more</li>
                        )}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category selection for archive */}
          {archivePreview && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Category *</CardTitle>
                <CardDescription>
                  All extracted files will be added to this category
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HierarchicalCategorySelector
                  value={archiveCategory}
                  onChange={(categoryId) => setArchiveCategory(categoryId)}
                  mode="select"
                />
              </CardContent>
            </Card>
          )}

          {/* Archive Result */}
          {archiveResult && (
            <Card className="mb-6 border-green-500 bg-green-50 dark:bg-green-950">
              <CardContent className="py-4 text-center">
                <p className="text-green-700 dark:text-green-300 font-medium">
                  {archiveResult.message}
                </p>
                {archiveResult.failed > 0 && (
                  <p className="text-amber-600 dark:text-amber-400 text-sm mt-1">
                    {archiveResult.failed} file(s) failed to upload
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Upload button with progress */}
          {archivePreview && (
            <Card className="mb-6 border-primary/50 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex flex-col gap-4">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleArchiveUpload}
                    disabled={
                      archiveUploading ||
                      !archiveCategory ||
                      !archivePreview.files.some((f) => f.selected)
                    }
                  >
                    {archiveUploading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Extracting and Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-5 w-5" />
                        Upload {archivePreview.files.filter((f) => f.selected).length} Files
                      </>
                    )}
                  </Button>

                  {/* Progress Bar */}
                  {archiveUploading && (
                    <div className="space-y-2">
                      <Progress value={archiveUploadProgress} showLabel />
                      <p className="text-sm text-muted-foreground text-center">
                        Processing archive files...
                      </p>
                    </div>
                  )}

                  {/* Requirements hint */}
                  {!archiveUploading && !archiveCategory && (
                    <p className="text-sm text-muted-foreground text-center">
                      Select a category above before uploading
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
