# Gong API Access Guide

This guide explains what level of access you need to Gong and how to set up the API integration.

## Access Requirements

### Required Role
- **Gong Administrator** role is required to generate API credentials
- If you're not an admin, ask your Gong administrator to generate credentials for you

### Required Permissions
The API credentials need access to:
- ✓ **Read calls** - To fetch call metadata
- ✓ **Read call transcripts** - To download conversation transcripts
- ✓ **Read CRM data** (optional but recommended) - To access deal/opportunity information

## Getting Your API Credentials

### Step-by-Step Instructions

1. **Log in to Gong** with administrator privileges

2. **Navigate to API Settings**
   - Click on your profile icon (top right)
   - Select **Admin** or **Company Settings**
   - Go to **Settings > Ecosystem > API**

3. **Generate API Key**
   - Click the **Get API Key** button
   - You'll receive two pieces of information:
     - **Access Key** (this is your username)
     - **Access Key Secret** (this is your password)

4. **Copy and Store Securely**
   - ⚠️ The Access Key Secret is only shown once!
   - Copy both values immediately
   - Store them in a password manager or secure location
   - Add them to your `.env` file:
     ```
     GONG_ACCESS_KEY=your_access_key_here
     GONG_ACCESS_KEY_SECRET=your_access_key_secret_here
     ```

### Security Best Practices

- 🔒 Never commit `.env` to version control (already in `.gitignore`)
- 🔒 Don't share credentials via email or chat
- 🔒 Use environment variables or secret management tools
- 🔒 Rotate credentials periodically
- 🔒 Revoke credentials if compromised

## Understanding Gong's API Structure

### Base URL
- `https://api.gong.io`

### Authentication
- **Method**: HTTP Basic Authentication
- **Username**: Your Access Key
- **Password**: Your Access Key Secret

### Key API Endpoints Used

This application uses the following Gong API endpoints:

#### 1. List Calls
```
GET /v2/calls
```
- Retrieves list of calls with metadata
- Supports filtering by date range
- Returns call IDs, participants, duration, etc.

#### 2. Get Call Transcript
```
POST /v2/calls/transcript
```
- Retrieves transcript for specific calls
- Returns speaker-separated conversation turns
- Includes timestamps and speaker identification

#### 3. CRM Integration (Optional)
```
GET /v2/crm/deals
```
- Requires CRM integration to be enabled in Gong
- Provides deal/opportunity data
- Links calls to specific deals

## API Limitations & Considerations

### Rate Limits
- Gong enforces rate limits on API calls
- The application handles this automatically
- Large syncs may take time

### Data Availability
- Only calls that have been recorded are available
- Transcripts require call recording to be enabled
- Some older calls may not have transcripts

### CRM Integration
- **Without CRM Integration**: You need to manually specify deal IDs
- **With CRM Integration**: Can automatically fetch deals from your CRM
- Supported CRMs: Salesforce, HubSpot, and others

## MVP Limitations

For this MVP version:

1. **Manual Deal ID Entry**
   - You must provide deal IDs manually
   - Find these in your CRM or Gong workspace
   - Future versions can auto-discover deals

2. **No Deal Filtering**
   - Can't automatically filter by deal stage
   - You'll need to know which deals are closed/lost
   - Future versions will integrate with CRM filters

3. **Call Association**
   - Currently fetches all calls and associates them with the deal
   - Relies on Gong's internal linking
   - May include unrelated calls in some cases

## Verifying Your Access

After setting up credentials, test the connection:

```bash
npm run sync -- --deal-id test
```

You should see:
```
🔌 Testing Gong connection...
✓ Connected to Gong
```

If you see an error:
- ❌ Check credentials are correct in `.env`
- ❌ Verify you have Administrator access
- ❌ Ensure API access is enabled for your Gong workspace

## Troubleshooting

### Error: "Unauthorized" or "401"
- Your credentials are incorrect
- Double-check the Access Key and Secret in `.env`
- Ensure there are no extra spaces or quotes

### Error: "Forbidden" or "403"
- Your account doesn't have required permissions
- Contact your Gong administrator
- May need additional API access enabled

### Error: "Rate Limit Exceeded" or "429"
- You've made too many API calls
- Wait a few minutes and try again
- Reduce the number of calls being synced

### Error: "Not Found" or "404"
- The deal ID or call ID doesn't exist
- Verify the ID in your Gong workspace
- Check for typos in the deal ID

## Finding Deal IDs

Since the MVP requires manual deal ID entry, here's how to find them:

### Option 1: From Gong URL
- Open a deal in Gong
- Look at the URL: `https://app.gong.io/deals/12345`
- The number `12345` is your deal ID

### Option 2: From CRM
- If using Salesforce, HubSpot, etc.
- The opportunity ID in your CRM is often the deal ID
- Check Gong's CRM integration settings to confirm

### Option 3: Contact Your Sales Team
- Your sales operations or RevOps team
- They can provide deal IDs for lost deals
- Ask for recent closed/lost opportunities

## Future Enhancements

Planned improvements for Gong integration:

1. **Automatic Deal Discovery**
   - Use CRM integration to fetch all closed/lost deals
   - Filter by date range, stage, etc.
   - No manual deal ID entry needed

2. **Webhook Support**
   - Real-time sync when deals close
   - Automatic analysis triggers
   - Proactive insights

3. **Enhanced Filtering**
   - Filter by sales rep, region, deal size
   - Custom deal stage mappings
   - Smart deal selection

4. **Better Error Handling**
   - Retry logic for failed API calls
   - Graceful degradation
   - Detailed error reporting

## Additional Resources

- [Gong API Documentation](https://gong.io/api/)
- [Gong Help Center - API Access](https://help.gong.io/docs/receive-access-to-the-api)
- [Gong Community Forums](https://community.gong.io/)

## Questions?

If you encounter issues with Gong access:
1. Check this guide first
2. Review Gong's official API documentation
3. Contact your Gong administrator
4. Check the application logs for detailed error messages

---

**Remember**: Keep your API credentials secure and never share them publicly!



