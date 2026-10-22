
const express = require('express');
const pool = require('./config/db');

const app = express();

// Allow the server to read JSON data
app.use(express.json());

// Test route
app.get('/', (req, res) => {
    res.send('Incident Tracker API is running');
});


app.post('/api/incidents', async (req, res) => {
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

        const result = await pool.query(
            `INSERT INTO incidents (title, description, location, severity)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [title, description, location || null, severity || 'medium']
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
app.get('/api/incidents', async (req, res) => {
    try {
        const { status, severity, search } = req.query;
        
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
            values.push(status);
            query += ` AND status = $${values.length}`;
        }

        if (severity) {
            values.push(severity);
            query += ` AND severity = $${values.length}`;
        }

        if (search) {
            values.push(`%${search}%`);
            query += ` AND (title ILIKE $${values.length} OR description ILIKE $${values.length})`;
        }

        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, values);

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching incidents:', error.message);
        res.status(500).json({
            message: 'Failed to fetch incident reports'
        });
    }
});


 // Get one incident by ID
app.get('/api/incidents/:id', async (req, res) => {
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


 // Update an incident's status
app.patch('/api/incidents/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const incidentId = Number(id);

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
                message: 'Incident not found'
            });
        }

        res.status(200).json({
            message: 'Incident status updated successfully',
            incident: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating incident status:', error.message);

        res.status(500).json({
            message: 'Failed to update incident status'
        });
    }
});


 // Delete an incident by ID
app.delete('/api/incidents/:id', async (req, res) => {
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


// Start server
app.listen(5000, () => {
    console.log('Incident Tracker is running on port 5000');
});
