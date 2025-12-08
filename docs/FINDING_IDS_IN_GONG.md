# Finding IDs in Gong

This guide helps you find the right IDs to use with the analyzer.

## Understanding Gong IDs

Gong has different types of IDs:
- **Account ID** (Company ID) - Represents a customer company/organization
- **Deal ID** (Opportunity ID) - Represents a specific sales opportunity
- **Call ID** - Represents an individual call recording

For analysis, you typically want to use either an **Account ID** or **Deal ID**.

## How to Find Account IDs

### Method 1: From Gong URL (Easiest)

1. Log in to Gong
2. Navigate to the account/company you want to analyze
3. Look at the URL in your browser:
   ```
   https://app.gong.io/company/1234567890
   ```
4. The number after `/company/` is your **Account ID**: `1234567890`

### Method 2: From Call Details

1. Open any call in Gong
2. Look at the "Company" or "Account" section
3. Click on the company name
4. Get the ID from the URL (see Method 1)

### Method 3: From Gong's Companies Page

1. Go to the Companies or Accounts section in Gong
2. Click on a company
3. Get the ID from the URL

## How to Find Deal/Opportunity IDs

### Method 1: From Gong URL

1. Navigate to a specific deal/opportunity in Gong
2. Look at the URL:
   ```
   https://app.gong.io/deals/0987654321
   ```
3. The number after `/deals/` is your **Deal ID**: `0987654321`

### Method 2: From CRM Integration

If you have Salesforce, HubSpot, or another CRM integrated:
1. Find the Opportunity ID in your CRM
2. That same ID often works as the Deal ID in Gong
3. Example Salesforce Opportunity ID: `006XXXXXXXXXXXX`

### Method 3: From Call Details

1. Open a call in Gong
2. Look for "Opportunity" or "Deal" section
3. Click on it to open the deal
4. Get the ID from the URL

## Which Should You Use?

### Use Account ID when:
- ✅ You want to analyze ALL calls with a customer company
- ✅ The deal is not clearly defined in Gong
- ✅ You want a broader view of the relationship
- ✅ You have multiple lost opportunities with the same company

### Use Deal ID when:
- ✅ You want to analyze a specific opportunity
- ✅ You have CRM integration enabled
- ✅ You want focused analysis on one sales cycle
- ✅ The deal/opportunity is clearly tracked

## Using IDs with the Analyzer

### With Account ID:
```bash
npm run sync -- --account-id 1234567890
npm run analyze -- --deal-id 1234567890
```

Note: After sync with `--account-id`, use the same ID with `--deal-id` for analysis (they're stored the same way internally).

### With Deal ID:
```bash
npm run sync -- --deal-id 0987654321
npm run analyze -- --deal-id 0987654321
```

## Real-World Examples

### Example 1: Lost deal with a specific company
```bash
# You have Acme Corp's account ID from Gong
npm run sync -- --account-id 5555123456

# This fetches all calls with Acme Corp
# Then analyze
npm run analyze -- --deal-id 5555123456
```

### Example 2: Specific opportunity that failed
```bash
# You have a Salesforce Opportunity ID
npm run sync -- --deal-id 006ABC123XYZ456

# This fetches calls linked to that specific opportunity
# Then analyze
npm run analyze -- --deal-id 006ABC123XYZ456
```

## Common ID Formats

### Gong Native IDs
- **Account/Company**: Usually 10-13 digits (e.g., `1234567890`)
- **Deal**: Usually 10-13 digits (e.g., `9876543210`)
- **Call**: Usually longer alphanumeric (e.g., `8123456789012345678`)

### Salesforce IDs
- **Account**: 18 characters, starts with `001` (e.g., `001XXXXXXXXXXXX`)
- **Opportunity**: 18 characters, starts with `006` (e.g., `006XXXXXXXXXXXX`)

### HubSpot IDs
- Usually numeric (e.g., `12345678`)

## Troubleshooting

### "No calls found"

Try these steps:

1. **Verify the ID is correct**
   - Copy it directly from the Gong URL
   - Remove any extra spaces or characters

2. **Check if calls exist**
   - Open the account/deal in Gong
   - Verify there are recorded calls

3. **Try a different ID**
   - If account ID doesn't work, try a specific deal ID
   - Or vice versa

4. **Check date range**
   - By default, we fetch last 90 days of calls
   - Very old calls might not appear

### "Invalid ID format"

- Ensure you're copying the entire ID
- Don't include any URL parameters (everything after `?`)
- Use only the numeric or alphanumeric ID itself

### Still having issues?

The application will:
1. First try to fetch calls using your ID as an account ID
2. If that fails, fall back to fetching recent calls
3. You'll see all calls in the last 90 days for analysis

## Quick Reference

| What you have | Command to use |
|---------------|----------------|
| Gong Company URL | `--account-id` with the number from URL |
| Gong Deal URL | `--deal-id` with the number from URL |
| Salesforce Opportunity | `--deal-id` with the 18-char ID |
| HubSpot Deal | `--deal-id` with the numeric ID |
| Just want all recent calls | Use any account ID from Gong |

## Pro Tips

1. **Keep a list**: Save IDs for lost deals you want to track
2. **Use descriptive names**: After sync, you can manually edit the JSON files to add better names
3. **Batch analysis**: Sync multiple accounts/deals, then analyze them all at once
4. **Check the URL**: The easiest way is always to just look at the Gong URL

---

**Most Common Use Case:**

You have a lost customer → Find their company in Gong → Copy the account ID from URL → Use with `--account-id`

That's it! 🎯



