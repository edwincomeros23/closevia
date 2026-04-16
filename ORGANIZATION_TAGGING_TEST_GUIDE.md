# Organization Tagging Feature - Test Guide

## Overview
This guide walks you through testing the new **Organization Tagging** feature implemented in Phase 3. The feature allows users to tag products with one or more organizations they're members of during product creation.

## What Was Implemented

### Backend (Completed ✅)
- **Database Table**: `product_organization_tags` (junction table linking products to organizations)
- **API Endpoint**: `GET /api/organizations/my-approved` - Returns user's approved organizations
- **CreateProduct Handler**: Modified to parse `organization_ids` from FormData and tag products post-creation
- **Validation**: Membership verification ensures users can only tag organizations they're approved members of

### Frontend (Completed ✅)
- **State Management**: Added organization selection state in AddProduct component
- **useEffect Hook**: Auto-fetches user's approved organizations on component mount
- **Step 3 UI**: New organization selector with checkboxes and visual feedback
- **FormData**: Appends `organization_ids` JSON array during product submission

---

## End-to-End Test Flow

### Prerequisites
1. A user account with approved membership in at least one organization
2. Access to create products
3. Go backend running (`go run main.go`)
4. React frontend running (dev server)

### Test Steps

#### Step 1: Navigate to Product Creation
1. Log in with a user account
2. Go to **Add Product** or click the "Create Listing" button
3. You should land on Step 1 (Image upload)

#### Step 2: Complete Steps 1 & 2
1. **Step 1**: Upload at least 1 product image
2. **Step 2**: Fill in product details:
   - Title: "Test Product for Organization Tagging"
   - Description: "This is a test product to verify organization tagging works correctly."
   - Category: Any category
   - Condition: Any condition
   - Price: Any price (e.g., 999)
   - What you want: Any item category
   - Proceed to Step 3

#### Step 3: Organization Tagging (NEW FEATURE)
1. **Look for "Tag Organizations" Section** (orange background):
   - Should display: "🏢 Tag Organizations"
   - Helper text: "Tag one or more organizations to also display your product in their marketplace. This is optional."

2. **Verify Organization Fetching**:
   - If loading: Should see a small spinner briefly while fetching organizations
   - If user has approved memberships: List of organizations should appear with checkboxes
   - If user has no approved organizations: Should show "You don't have any approved organizations yet."

3. **Select Organizations** (if available):
   - Click on one or more organization items to select them
   - Visual feedback: Border color changes to orange, background becomes orange-tinted
   - Selected organizations should appear as orange badges below

4. **Verify Selected State**:
   - Selected organization names should appear in badge pills below the list
   - Each badge shows the full organization name

#### Step 4: Submit Product with Organization Tags
1. Ensure terms checkbox is checked (if required)
2. Click "Post Listing" button
3. Wait for product to be created (should see "Posting your product..." modal)
4. Should redirect to dashboard on success

#### Step 5: Verify in Database (Optional - Direct SQL Check)
```sql
-- Check product was created
SELECT id, title, seller_id FROM products WHERE title = 'Test Product for Organization Tagging' LIMIT 1;

-- Check organization tags were recorded (replace {product_id} with actual ID from above)
SELECT pot.id, pot.product_id, pot.organization_id, o.name 
FROM product_organization_tags pot
JOIN organizations o ON pot.organization_id = o.id
WHERE pot.product_id = {product_id};
```

Expected result: 1 row per selected organization

#### Step 6: Verify Product in Organization Feed (Optional - UI Check)
1. Navigate to an organization profile that you tagged
2. Go to the organization's product feed/marketplace
3. Your newly created product should appear in the list
4. If multiple organizations were tagged, product should appear in all of them

---

## Expected Behaviors

### Success Cases ✅
| Case | Expected Result |
|------|-----------------|
| No organizations approved | "You don't have any approved organizations yet." message |
| Select 1 organization | Badge shows organization name, database record created |
| Select 2+ organizations | All selected badges show, multiple database records created |
| No organizations selected | Product created normally (single source of truth maintained) |
| Organization membership revoked after tagging | Product may need cleanup (consider implementing) |

### Edge Cases 🔍
| Case | Expected Behavior |
|------|-------------------|
| User not approved member of org | User cannot select it (UI won't show non-approved orgs) |
| Duplicate tag (same org selected twice) | UNIQUE constraint in DB prevents duplicates (INSERT IGNORE) |
| Deleted organization | Foreign key cascade should handle cleanup |
| Multiple products, same org tag | All tagged products appear in org feed |

---

## Error Handling Test Cases

### Network Failures
1. **API Endpoint Unreachable**: 
   - Should see "You don't have any approved organizations yet."
   - User can still post product without org tags

2. **FormData Submission Fails**:
   - Should see error toast: "Oops! Could not post your item."
   - Organization selection state should be preserved

### Permission Issues
1. **Non-approved Member Attempts Tagging**:
   - Backend validates membership status = 'approved'
   - Non-approved orgs won't tag even if sent in FormData
   - Product still created successfully (graceful degradation)

---

## Performance Checks

1. **Organization Fetch Performance**:
   - Should complete within 1-2 seconds
   - Loading spinner should briefly appear

2. **Product Creation Performance**:
   - Single FormData POST request (not multiple)
   - Multiple organization tags processed on backend
   - Should complete within 3-5 seconds for typical products

3. **Database Efficiency**:
   - Indexes on `product_organization_tags` (product_id, organization_id)
   - UNIQUE constraint prevents duplicate tags
   - Queries include LIMIT where applicable

---

## UI/UX Verification

- [ ] Organization section clearly labeled with 🏢 emoji
- [ ] Helper text explains feature is optional
- [ ] Checkboxes are easily clickable
- [ ] Selected state visually distinct (orange border + background)
- [ ] Selected badges clearly display organization names
- [ ] Loading spinner appears during org fetch
- [ ] No accessibility issues (proper labels, keyboard navigation)

---

## Data Integrity Checks

Run these SQL queries post-testing:

```sql
-- Verify UNIQUE constraint (should be 0 duplicates)
SELECT product_id, organization_id, COUNT(*)
FROM product_organization_tags
GROUP BY product_id, organization_id
HAVING COUNT(*) > 1;

-- Verify all tagged orgs still exist
SELECT COUNT(*)
FROM product_organization_tags pot
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = pot.organization_id);

-- Verify all products still exist
SELECT COUNT(*)
FROM product_organization_tags pot
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = pot.product_id);

-- Count total tags per product
SELECT product_id, COUNT(*) as tag_count
FROM product_organization_tags
GROUP BY product_id
ORDER BY tag_count DESC;
```

---

## Troubleshooting

### Organizations Not Loading
**Symptom**: "You don't have any approved organizations yet." even though user is approved member
**Solution**: 
1. Verify membership status in DB: `SELECT * FROM organization_memberships WHERE user_id = ? AND status = 'approved'`
2. Check if organizations are marked as deleted: `SELECT is_deleted FROM organizations WHERE id = ?`
3. Verify API endpoint returns data: `GET /api/organizations/my-approved`

### Organization Tags Not Saving
**Symptom**: Product created but tags not in database
**Solution**:
1. Check backend logs for validation errors
2. Verify `organization_ids` is being sent in FormData: `JSON.stringify([1,2,3])`
3. Confirm user is approved member of each org
4. Check database `product_organization_tags` table exists

### UI Issues
**Symptom**: Checkboxes not appearing or clicking doesn't work
**Solution**:
1. Check browser console for JavaScript errors
2. Verify Chakra UI Checkbox component imported properly
3. Ensure `selectedOrganizationIds` state is being updated
4. Inspect element to see if DOM is rendering

---

## Success Criteria ✅

Feature is **COMPLETE** when:
1. ✅ Users can see their approved organizations in Step 3
2. ✅ Users can select/deselect organizations with visual feedback
3. ✅ Selected organizations are tagged to created product
4. ✅ Product appears in all tagged organization feeds
5. ✅ Database records properly created and maintained
6. ✅ Single product instance maintained (no duplication)
7. ✅ No errors in browser console or backend logs
8. ✅ All edge cases handled gracefully

---

## What's Next (Future Enhancements)

1. **Product Card Display**
   - Show which organizations product is tagged with
   - Display organization logos on product cards
   
2. **Organization Feed Integration**
   - Add filter to show products by organization
   - Update query to JOIN `product_organization_tags`

3. **Organization Admin Features**
   - Manage/approve products before they appear in org feed
   - Analytics on org-tagged products

4. **Mobile Optimization**
   - Organization selector on mobile (maybe modal/drawer)
   - Touch-friendly checkbox interactions

5. **Cleanup Management**
   - What happens when membership is revoked?
   - Should product auto-remove from org feed?

---

## Notes

- **Feature is Optional**: Users can continue posting products without tagging any organization
- **Single Source of Truth**: One product record shared across all tagged organizations
- **Membership Validation**: Only approved members can tag their organizations
- **Graceful Degradation**: If org tagging fails, product still created successfully
