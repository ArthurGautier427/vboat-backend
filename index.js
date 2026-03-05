const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client (uses service_role key to bypass RLS for writes)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Middleware
app.use(cors());
app.use(express.json());

// Multer for handling file uploads (in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Auth middleware - protects POST endpoint with a secret API key
function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /posts - Public endpoint to fetch all posts (for the feed)
app.get('/posts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /posts - Protected endpoint to create a new post
app.post('/posts', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { text } = req.body;
    let image_url = null;

    // If an image was uploaded, store it in Supabase Storage
    if (req.file) {
      const fileName = Date.now() + '-' + req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype
        });

      if (uploadError) throw uploadError;

      // Get the public URL for the uploaded image
      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(fileName);

      image_url = urlData.publicUrl;
    }

    // Insert the post into the database
    const { data, error } = await supabase
      .from('posts')
      .insert([{ text, image_url }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Vboat backend is running' });
});

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
