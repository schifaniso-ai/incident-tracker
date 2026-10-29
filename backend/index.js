const express = require('express');
const authRoutes = require('./routes/auth');
const cors = require('cors');
const pool = require('./config/db');
const multer = require('multer');
const path = require('path');
const authMiddleware = require('./middleware/authMiddleware');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
    }
  },
});

const app = express();

// Allow requests from the React frontend
app.use(cors({
    origin: 'http://localhost:3000'
}));


// Allow the server to read JSON data
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Test route
app.get('/', (req, res) => {
    res.send('Incident Tracker API is running');
});



app.post('/api/incidents', authMiddleware, upload.single('photo'), async (req, res) => {
    try {
        const { title, description, location, severity } = req.body;

        // Validate severity
        const allowedSeverities = ['low', 'medium', 'high'];

        if (severity && !allowedSeverities.includes(severity)) {
            return res.status(400).json({
                message: 'Invalid severity. Use low, medium, or high.'
            });
        }

        // Validate required fields
        if (
            !title || !title.trim() ||
            !description || !description.trim()
        ) {
            return res.status(400).json({
                message: 'Title and description are required.'
            });
        }

        // Save the uploaded photo path, if provided
        const photoPath = req.file
            ? `/uploads/${req.file.filename}`
            : null;

        const result = await pool.query(
            `INSERT INTO incidents
                (title, description, location, severity, photo_path)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                title.trim(),
                description.trim(),
                location?.trim() || null,
                severity || 'medium',
                photoPath
            ]
        );

        res.status(201).json({
            message: 'Incident report saved successfully',
            incident: result.rows[0]
        });
    } catch (error) {
        console.error('Error saving incident:', error.message);

        res.status(500).json({
            message: 'Failed to save incident report'
        });
    }
});


 // Get all incidents, with optional filters and search
app.get('/api/incidents', authMiddleware, async (req, res) => {
    try {
       const {
    status,
    severity,
    search,
    page = '1',
    sort = 'newest',
    startDate,
    endDate
} = req.query;

// Validate page number
const pageNumber = Number(page);

if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return res.status(400).json({
        message: 'Page must be a positive integer.'
    });
}

// Pagination settings
const limit = 10;
const offset = (pageNumber - 1) * limit;

// Validate sort option
const allowedSortOptions = ['newest', 'oldest'];

if (
    typeof sort !== 'string' ||
    !allowedSortOptions.includes(sort.toLowerCase())
) {
    return res.status(400).json({
        message: 'Invalid sort option. Use newest or oldest.'
    });
}

// Validate date filters
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

if (startDate && !datePattern.test(startDate)) {
    return res.status(400).json({
        message: 'Invalid startDate. Use YYYY-MM-DD format.'
    });
}

if (endDate && !datePattern.test(endDate)) {
    return res.status(400).json({
        message: 'Invalid endDate. Use YYYY-MM-DD format.'
    });
}

// Validate actual calendar dates
const isValidDate = (date) => {
    if (!date) return true;

    const parsedDate = new Date(`${date}T00:00:00Z`);

    return !Number.isNaN(parsedDate.getTime()) &&
        parsedDate.toISOString().startsWith(date);
};

if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return res.status(400).json({
        message: 'Invalid calendar date.'
    });
}

// Ensure start date is not after end date
if (startDate && endDate && startDate > endDate) {
    return res.status(400).json({
        message: 'startDate must be before or equal to endDate.'
    });
}

// Validate search input
        if (search !== undefined) {
            if (typeof search !== 'string' || !search.trim()) {
                return res.status(400).json({
                    message: 'Search must not be empty.'
                });
            }

            if (search.trim().length > 100) {
                return res.status(400).json({
                    message: 'Search must not exceed 100 characters.'
                });
            }
        }


        // Validate status filter
        const allowedStatuses = ['open', 'in progress', 'resolved'];

        if (status && !allowedStatuses.includes(status.toLowerCase())) {
            return res.status(400).json({
                message: 'Invalid status. Use open, in progress, or resolved.'
            });
        }

        // Validate severity filter
        const allowedSeverities = ['low', 'medium', 'high'];

        if (severity && !allowedSeverities.includes(severity.toLowerCase())) {
            return res.status(400).json({
                message: 'Invalid severity. Use low, medium, or high.'
            });
        }


        let query = 'SELECT * FROM incidents WHERE 1=1';
        const values = [];

        if (status) {
            values.push(status.toLowerCase());
            query += ` AND status = $${values.length}`;
        }

// Filter incidents by date range

if (startDate) {
    values.push(startDate);
    query += ` AND created_at >= $${values.length}`;
}

if (endDate) {
    values.push(endDate);
    query += ` AND created_at < ($${values.length}::date + INTERVAL '1 day')`;
}


        if (severity) {
            values.push(severity.toLowerCase());
            query += ` AND severity = $${values.length}`;
        }

        if (search) {
            values.push(`%${search}%`);
            query += ` AND (title ILIKE $${values.length} OR description ILIKE $${values.length})`;
        }

const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)');
const countResult = await pool.query(countQuery, values);
const total = Number(countResult.rows[0].count);
const totalPages = Math.ceil(total / limit);

 // Sort incidents by date
if (sort.toLowerCase() === 'oldest') {
    query += ' ORDER BY created_at ASC';
} else {
    query += ' ORDER BY created_at DESC';
}
        values.push(limit, offset);
        query += ` LIMIT $${values.length - 1} OFFSET $${values.length}`;

        const result = await pool.query(query, values);

        res.status(200).json({
    page: pageNumber,
    limit,
    total,
    totalPages,
    incidents: result.rows
});

    } catch (error) {
        console.error('Error fetching incidents:', error.message);
        res.status(500).json({
            message: 'Failed to fetch incident reports'
        });
    }
});


 // Get one incident by ID
app.get('/api/incidents/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const incidentId = Number(id);

if (!Number.isInteger(incidentId) || incidentId <= 0) {
    return res.status(400).json({
        message: 'Incident ID must be a positive whole number.'
    });
}

        const result = await pool.query(
            'SELECT * FROM incidents WHERE id = $1',
            [incidentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Incident not found'
            });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching incident:', error.message);

        res.status(500).json({
            message: 'Failed to fetch incident'
        });
    }
});


 // Edit an incident's details
app.patch('/api/incidents/:id', authMiddleware, upload.single('photo'), async (req, res) => {
    try {
        const incidentId = Number(req.params.id);
        const { title, description, location, severity } = req.body;

        if (!Number.isInteger(incidentId) || incidentId <= 0) {
            return res.status(400).json({
                message: 'Incident ID must be a positive whole number.'
            });
        }

        if (
            typeof title !== 'string' || !title.trim() ||
            typeof description !== 'string' || !description.trim()
        ) {
            return res.status(400).json({
                message: 'Title and description are required.'
            });
        }

        const allowedSeverities = ['low', 'medium', 'high'];

        if (
            severity &&
            !allowedSeverities.includes(severity.toLowerCase())
        ) {
            return res.status(400).json({
                message: 'Invalid severity. Use low, medium, or high.'
            });
        }

       const photoPath = req.file
    ? `/uploads/${req.file.filename}`
    : null;

const result = await pool.query(
    `UPDATE incidents
     SET title = $1,
         description = $2,
         location = $3,
         severity = $4,
         photo_path = COALESCE($5, photo_path)
     WHERE id = $6
     RETURNING *`,
    [
        title.trim(),
        description.trim(),
        typeof location === 'string' && location.trim()
            ? location.trim()
            : null,
        severity ? severity.toLowerCase() : 'medium',
        photoPath,
        incidentId
    ]
);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Incident not found.'
            });
        }

        res.status(200).json({
            message: 'Incident updated successfully.',
            incident: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating incident:', error.message);

        res.status(500).json({
            message: 'Failed to update incident.'
        });
    }
});


 

 // Update an incident's status
app.patch('/api/incidents/:id/status', authMiddleware, async (req, res) => {
    try {
        console.log('Request body:', req.body);
        console.log('Uploaded file:', req.file);

        const incidentId = Number(req.params.id);

        if (!Number.isInteger(incidentId) || incidentId <= 0) {
            return res.status(400).json({
                message: 'Incident ID must be a positive whole number.'
            });
        }

        const { status } = req.body;
        const normalizedStatus = status?.trim().toLowerCase();

        const allowedStatuses = ['open', 'in progress', 'resolved'];

        if (!allowedStatuses.includes(normalizedStatus)) {
            return res.status(400).json({
                message: 'Invalid status. Use open, in progress, or resolved.'
            });
        }

        const result = await pool.query(
    `UPDATE incidents
     SET status = $1
     WHERE id = $2
     RETURNING *`,
    [normalizedStatus, incidentId]
);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Incident not found.'
            });
        }

        res.status(200).json({
            message: 'Incident status updated successfully.',
            incident: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating incident status:', error.message);

        res.status(500).json({
            message: 'Failed to update incident status.'
        });
    }
});


 


// Start server
app.listen(5000, () => {
    console.log('Incident Tracker is running on port 5000');
});
// Delete an incident by ID
app.delete('/api/incidents/:id', authMiddleware, async (req, res) => {
    try {
        const incidentId = Number(req.params.id);

        if (!Number.isInteger(incidentId) || incidentId <= 0) {
            return res.status(400).json({
                message: 'Incident ID must be a positive whole number.'
            });
        }

        const result = await pool.query(
            'DELETE FROM incidents WHERE id = $1 RETURNING *',
            [incidentId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Incident not found'
            });
        }

        res.status(200).json({
            message: 'Incident deleted successfully',
            incident: result.rows[0]
        });
    } catch (error) {
        console.error('Error deleting incident:', error.message);
        res.status(500).json({
            message: 'Failed to delete incident'
        });
    }
});