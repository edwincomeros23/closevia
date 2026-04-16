import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Heading,
  HStack,
  Image,
  Input,
  Link,
  Skeleton,
  Spinner,
  Text,
  Textarea,
  useToast,
  VStack,
  IconButton,
  Select,
} from '@chakra-ui/react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { AddIcon, DeleteIcon } from '@chakra-ui/icons'
import { api } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { getImageUrl } from '../utils/imageUtils'
import { User } from '../types'
import FloatingTab from '../components/FloatingTab'

const OrganizationProfile: React.FC = () => {
  const { user } = useAuth()
  const toast = useToast()
  const { handle } = useParams<{ handle: string }>()
  const [org, setOrg] = useState<User | null>(null)
  const [communityOrg, setCommunityOrg] = useState<any | null>(null)
  const [feedPosts, setFeedPosts] = useState<any[]>([])
  const [tradeFeed, setTradeFeed] = useState<any[]>([])
  const [joinRequests, setJoinRequests] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [joinLoading, setJoinLoading] = useState(false)
  const [postContent, setPostContent] = useState('')
  const [postCategoryTag, setPostCategoryTag] = useState('')
  const [postType, setPostType] = useState<'regular' | 'looking_for'>('regular')
  const [postImages, setPostImages] = useState<File[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])
  const [posting, setPosting] = useState(false)
  const [postComments, setPostComments] = useState<{ [postId: number]: any[] }>({})
  const [commentText, setCommentText] = useState<{ [postId: number]: string }>({})
  const [adminLoading, setAdminLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tradeFeedProducts, setTradeFeedProducts] = useState<any[]>([])
  const [tradeFeedLoading, setTradeFeedLoading] = useState(false)

  const fetchOrganization = useCallback(async () => {
    if (!handle) return
    setLoading(true)
    setError('')
    try {
      const communityRes = await api.get(`/api/organizations/${handle}`)
      if (communityRes.data?.success && communityRes.data?.data) {
        setCommunityOrg(communityRes.data.data)
        setOrg(null)
      }
    } catch {
      try {
        const res = await api.get(`/api/users/organizations/${handle}`)
        setOrg((res.data?.data || null) as User | null)
        setCommunityOrg(null)
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Failed to load organization profile')
      }
    } finally {
      setLoading(false)
    }
  }, [handle])

  const fetchFeed = useCallback(async () => {
    if (!handle || !communityOrg || communityOrg.membership_status !== 'approved') return
    try {
      const res = await api.get(`/api/organizations/${handle}/feed`)
      setFeedPosts(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {
      setFeedPosts([])
    }
  }, [handle, communityOrg])

  const fetchTradeFeed = useCallback(async () => {
    if (!handle || !communityOrg) return
    const ms = communityOrg?.membership_status
    const canView = ms === 'approved' || (user && Number(user.id) === Number(communityOrg.creator_user_id))
    if (!canView) return
    setTradeFeedLoading(true)
    try {
      const res = await api.get(`/api/organizations/${handle}/trade-feed`)
      const data = Array.isArray(res.data?.data) ? res.data.data : []
      setTradeFeed(data)
      setTradeFeedProducts(data)
    } catch {
      setTradeFeed([])
      setTradeFeedProducts([])
    } finally {
      setTradeFeedLoading(false)
    }
  }, [handle, communityOrg, user])

  const fetchAdminData = useCallback(async () => {
    if (!handle || !communityOrg || !user || communityOrg.creator_user_id !== user.id) return
    setAdminLoading(true)
    try {
      const [requestsRes, membersRes] = await Promise.all([
        api.get(`/api/organizations/${handle}/join-requests`),
        api.get(`/api/organizations/${handle}/members`),
      ])
      setJoinRequests(Array.isArray(requestsRes.data?.data) ? requestsRes.data.data : [])
      setMembers(Array.isArray(membersRes.data?.data) ? membersRes.data.data : [])
    } catch {
      setJoinRequests([])
      setMembers([])
    } finally {
      setAdminLoading(false)
    }
  }, [handle, communityOrg, user])

  useEffect(() => {
    fetchOrganization()
  }, [fetchOrganization])

  useEffect(() => {
    if (!communityOrg) return
    setPostCategoryTag(communityOrg.category || '')
    fetchFeed()
    fetchTradeFeed()
    fetchAdminData()
  }, [communityOrg, fetchFeed, fetchTradeFeed, fetchAdminData])

  const isCreator = useMemo(() => Boolean(user && communityOrg && Number(user.id) === Number(communityOrg.creator_user_id)), [user, communityOrg])
  const membershipStatus = communityOrg?.membership_status || 'none'

  const handleJoinRequest = async () => {
    if (!handle || !user) return
    setJoinLoading(true)
    try {
      await api.post(`/api/organizations/${handle}/join-request`)
      toast({ title: 'Join request sent', status: 'success' })
      await fetchOrganization()
    } catch (err: any) {
      toast({ title: 'Failed to send request', description: err?.response?.data?.error || 'Please try again', status: 'error' })
    } finally {
      setJoinLoading(false)
    }
  }

  const handleDecide = async (targetUserId: number, action: 'approve' | 'reject') => {
    if (!handle) return
    try {
      await api.post(`/api/organizations/${handle}/join-requests/${targetUserId}`, { action })
      toast({ title: `Request ${action}d`, status: 'success' })
      fetchAdminData()
      fetchOrganization()
    } catch (err: any) {
      toast({ title: 'Action failed', description: err?.response?.data?.error || 'Please try again', status: 'error' })
    }
  }

  const handleRemoveMember = async (targetUserId: number) => {
    if (!handle) return
    try {
      await api.post(`/api/organizations/${handle}/members/${targetUserId}/remove`)
      toast({ title: 'Member removed', status: 'success' })
      fetchAdminData()
      fetchFeed()
    } catch (err: any) {
      toast({ title: 'Failed to remove member', description: err?.response?.data?.error || 'Please try again', status: 'error' })
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const validFiles = files.filter(f => f.type.startsWith('image/'))
    setPostImages(prev => [...prev, ...validFiles])
    
    // Create preview URLs
    validFiles.forEach(file => {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreviewUrls(prev => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
    
    // Reset input value so same files can be selected again
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    setPostImages(prev => prev.filter((_, i) => i !== index))
    setImagePreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  const handleAddComment = async (postId: number) => {
    if (!handle || !commentText[postId]?.trim()) return
    try {
      await api.post(`/api/organizations/${handle}/posts/${postId}/comments`, {
        content: commentText[postId].trim()
      })
      setCommentText(prev => ({ ...prev, [postId]: '' }))
      fetchFeed()
      toast({ title: 'Comment added', status: 'success' })
    } catch (err: any) {
      toast({ title: 'Failed to add comment', description: err?.response?.data?.error, status: 'error' })
    }
  }

  const handleCreatePost = async () => {
    // Allow posting if there's content OR images
    if (!handle || (!postContent.trim() && postImages.length === 0)) {
      toast({ title: 'Please add content or images', status: 'warning' })
      return
    }
    
    setPosting(true)
    try {
      const formData = new FormData()
      formData.append('content', postContent.trim())
      formData.append('category_tag', postCategoryTag || communityOrg?.category || '')
      formData.append('is_looking_for', postType === 'looking_for' ? 'true' : 'false')
      
      // Append images
      if (postImages.length > 0) {
        postImages.forEach(file => {
          formData.append('images', file)
        })
      }

      const res = await api.post(`/api/organizations/${handle}/posts`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      if (res.data?.success) {
        setPostContent('')
        setPostType('regular')
        setPostImages([])
        setImagePreviewUrls([])
        setPostCategoryTag('')
        toast({ title: 'Post published successfully!', status: 'success' })
        fetchFeed()
      } else {
        toast({ title: 'Failed to publish post', description: res.data?.error || 'Unknown error', status: 'error' })
      }
    } catch (err: any) {
      console.error('Post creation error:', err)
      const errorMsg = err?.response?.data?.error || err?.message || 'Please try again'
      toast({ title: 'Failed to publish post', description: errorMsg, status: 'error' })
    } finally {
      setPosting(false)
    }
  }

  if (loading) {
    return (
      <Container maxW="5xl" py={{ base: 6, md: 10 }}>
        <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="2xl" overflow="hidden">
          <Skeleton h={{ base: '150px', md: '220px' }} />

          <Box px={{ base: 4, md: 8 }} pb={{ base: 6, md: 8 }} mt="-48px" position="relative">
            <Skeleton w={{ base: '86px', md: '110px' }} h={{ base: '86px', md: '110px' }} borderRadius="full" mb={4} />

            <VStack align="start" spacing={3}>
              <Skeleton h="30px" w="260px" />
              <Skeleton h="18px" w="160px" />
              <Skeleton h="18px" w="140px" />
              <Skeleton h="16px" w="100%" />
              <Skeleton h="16px" w="85%" />

              <HStack spacing={6} pt={2} flexWrap="wrap">
                <Skeleton h="14px" w="180px" />
                <Skeleton h="14px" w="220px" />
                <Skeleton h="14px" w="120px" />
              </HStack>

              <HStack pt={3} spacing={3}>
                <Skeleton h="40px" w="160px" borderRadius="md" />
                <Skeleton h="40px" w="170px" borderRadius="md" />
              </HStack>
            </VStack>
          </Box>
        </Box>
      </Container>
    )
  }

  if (error || (!org && !communityOrg)) {
    return (
      <Container maxW="4xl" py={10}>
        <Text color="red.500" mb={4}>{error || 'Organization not found'}</Text>
        <Button as={RouterLink} to="/home" variant="outline">Go Home</Button>
      </Container>
    )
  }

  return (
    <Box bg="#FFFDF1" minH="100vh" pb={{ base: '100px', md: 0 }}>
      <Container maxW={{ base: 'full', md: '5xl' }} px={{ base: 0, md: 6 }} py={{ base: 3, md: 10 }}>
        <VStack align="stretch" spacing={{ base: 4, md: 6 }}>
        <Box bg="white" borderWidth={{ base: 0, md: '1px' }} borderColor="gray.200" borderRadius={{ base: 0, md: '2xl' }} overflow="hidden" mx={{ base: 0, md: 0 }} boxShadow={{ base: 'none', md: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <Box h={{ base: '140px', md: '220px' }} bg="gray.100">
            <Image src={getImageUrl((communityOrg?.cover_url || (org as any)?.org_cover_url || (org as any)?.background_image))} alt="Organization cover" w="full" h="full" objectFit="cover" />
          </Box>

          <Box px={{ base: 4, md: 8 }} pb={{ base: 5, md: 8 }} pt={{ base: 3, md: 0 }} mt={{ base: '-40px', md: '-48px' }} position="relative">
            <Box w={{ base: '80px', md: '110px' }} h={{ base: '80px', md: '110px' }} borderRadius="full" overflow="hidden" border={{ base: '4px solid', md: '5px solid' }} borderColor="white" bg="gray.100" mb={{ base: 3, md: 4 }} boxShadow={{ base: 'none', md: '0 2px 8px rgba(0,0,0,0.1)' }}>
              <Image src={getImageUrl((communityOrg?.logo_url || org?.org_logo_url || org?.profile_picture))} alt={(communityOrg?.name || org?.org_name || org?.name || 'Organization')} w="full" h="full" objectFit="cover" />
            </Box>

            <VStack align="start" spacing={{ base: 2, md: 3 }}>
              <HStack spacing={3} wrap="wrap">
                <Heading size={{ base: 'md', md: 'xl' }}>{communityOrg?.name || org?.org_name || org?.name}</Heading>
                <Badge colorScheme="teal" fontSize={{ base: 'xs', md: 'sm' }} px={{ base: 2, md: 3 }} py={{ base: 1, md: 1.5 }}>{communityOrg?.category || (org as any)?.org_category || 'Community'}</Badge>
              </HStack>
              <Text color="gray.500" fontSize={{ base: 'xs', md: 'sm' }}>@{communityOrg?.slug || org?.org_handle || handle}</Text>
              <Text color="gray.700" fontSize={{ base: 'sm', md: 'md' }} lineHeight="1.6">{communityOrg?.description || org?.bio || 'No description yet.'}</Text>

              <VStack spacing={2} w="full" align="stretch">
                {(communityOrg?.creator_user_id || org?.id) && !isCreator ? <Button as={RouterLink} to={`/users/${communityOrg?.creator_user_id || org?.id}`} variant="outline" size={{ base: 'xs', md: 'sm' }} w="full">View Owner Profile</Button> : null}
                {!user ? <Button as={RouterLink} to="/login" colorScheme="teal" size={{ base: 'xs', md: 'sm' }} w="full">Login to Join</Button> : null}
                {user && !isCreator && membershipStatus === 'none' ? <Button colorScheme="teal" size={{ base: 'xs', md: 'sm' }} onClick={handleJoinRequest} isLoading={joinLoading} w="full">Request to Join</Button> : null}
                <HStack spacing={2} w="full" wrap="wrap">
                  {user && membershipStatus === 'pending' ? <Badge colorScheme="orange" px={3} py={1} borderRadius="full">Join request pending</Badge> : null}
                  {user && membershipStatus === 'approved' ? <Badge colorScheme="green" px={3} py={1} borderRadius="full">Approved member</Badge> : null}
                  {isCreator ? <Badge colorScheme="purple" px={3} py={1} borderRadius="full">Creator Admin</Badge> : null}
                </HStack>
                {isCreator ? <Button as={RouterLink} to="/organizations/new" size={{ base: 'xs', md: 'sm' }} colorScheme="teal" variant="outline" w="full">Create Another Organization</Button> : null}
              </VStack>
            </VStack>
          </Box>
        </Box>

        {communityOrg ? (
          <Box bg="white" borderWidth={{ base: 0, md: '1px' }} borderColor="gray.200" borderRadius={{ base: 0, md: 'xl' }} p={{ base: 3, md: 6 }} boxShadow={{ base: 'none', md: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <Heading size={{ base: 'sm', md: 'lg' }} mb={{ base: 3, md: 5 }} color="gray.900">Organization Feed</Heading>
            {(membershipStatus === 'approved' || isCreator) ? (
              <VStack align="stretch" spacing={{ base: 3, md: 4 }}>
                {/* Trade feed: tagged products */}
                <Box borderWidth="1px" borderColor="gray.200" borderRadius={{ base: 'md', md: 'lg' }} p={{ base: 3, md: 5 }} bg="white" boxShadow={{ base: 'none', md: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <Text fontSize={{ base: 'xs', md: 'md' }} fontWeight="700" color="gray.900" mb={2}>Tagged Trade Posts</Text>
                  {tradeFeed.length === 0 ? (
                    <Text color="gray.500" fontSize={{ base: 'xs', md: 'sm' }}>No tagged products yet.</Text>
                  ) : (
                    <VStack align="stretch" spacing={3}>
                      {tradeFeed.map((g: any) => (
                        <Box key={g.product_id} borderWidth="1px" borderColor="gray.200" borderRadius="md" p={3}>
                          <HStack justify="space-between" spacing={3} wrap="wrap">
                            <VStack align="start" spacing={0} minW={0} flex={1}>
                              <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="700" noOfLines={1}>{g.title || 'Untitled Product'}</Text>
                              <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.600" noOfLines={2}>{g.description || ''}</Text>
                              {g.category ? <Badge mt={1} colorScheme="teal" fontSize={{ base: '9px', md: 'xs' }}>{g.category}</Badge> : null}
                            </VStack>
                            <HStack spacing={2}>
                              {Array.isArray(g.members) && g.members.length > 0 ? (
                                <Avatar size="sm" src={g.members[0]?.profile_picture ? getImageUrl(g.members[0].profile_picture) : undefined} name={g.members[0]?.name || 'Member'} />
                              ) : null}
                              <Button as={RouterLink} to={`/products/${g.product_id}`} size="sm" variant="outline">View</Button>
                            </HStack>
                          </HStack>
                        </Box>
                      ))}
                    </VStack>
                  )}
                </Box>

                <Box borderWidth="1px" borderColor="gray.200" borderRadius={{ base: 'md', md: 'lg' }} p={{ base: 3, md: 5 }} bg="gray.50" boxShadow={{ base: 'none', md: '0 1px 2px rgba(0,0,0,0.05)' }}>
                  <VStack align="stretch" spacing={{ base: 3, md: 4 }}>
                    <Text fontSize={{ base: 'xs', md: 'md' }} fontWeight="700" color="gray.900">✨ Create a post</Text>

                    {/* Post Type Selection */}
                    <Select value={postType} onChange={(e) => setPostType(e.target.value as 'regular' | 'looking_for')} size="sm">
                      <option value="regular">📝 Regular Post</option>
                      <option value="looking_for">🔍 Looking for Trade</option>
                    </Select>

                    {postType === 'looking_for' && (
                      <Box p={2} bg="blue.50" borderRadius="md" borderWidth="1px" borderColor="blue.200">
                        <Text fontSize={{ base: '10px', md: 'xs' }} color="blue.700">💡 Share what items you're looking for in trades with other members</Text>
                      </Box>
                    )}

                    <Input value={postCategoryTag} onChange={(e) => setPostCategoryTag(e.target.value)} placeholder="Category tag (e.g., Cards, Electronics)" size="sm" />
                    <Textarea value={postContent} onChange={(e) => setPostContent(e.target.value)} placeholder={postType === 'looking_for' ? 'Describe what items or trades you\'re looking for...' : 'Share something relevant to this organization'} rows={3} size="sm" />

                    {/* Image Preview */}
                    {imagePreviewUrls.length > 0 && (
                      <Box>
                        <Text fontSize={{ base: '10px', md: 'xs' }} fontWeight="600" mb={2}>Attached photos ({imagePreviewUrls.length})</Text>
                        <HStack spacing={2} wrap="wrap">
                          {imagePreviewUrls.map((url, idx) => (
                            <Box key={idx} position="relative" w={{ base: '70px', md: '80px' }} h={{ base: '70px', md: '80px' }} borderRadius="md" overflow="hidden" borderWidth="1px" borderColor="gray.200">
                              <Image src={url} alt={`preview-${idx}`} w="full" h="full" objectFit="cover" />
                              <IconButton
                                aria-label="remove"
                                icon={<DeleteIcon />}
                                size="xs"
                                colorScheme="red"
                                position="absolute"
                                top={0}
                                right={0}
                                onClick={() => removeImage(idx)}
                              />
                            </Box>
                          ))}
                        </HStack>
                      </Box>
                    )}

                    {/* File Input - Mobile: Side by side buttons */}
                    <HStack spacing={2} w="full" display={{ base: 'flex', md: 'none' }}>
                      <Box as="label" htmlFor="org-post-images-mobile" flex={1} cursor="pointer">
                        <Input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleImageSelect}
                          display="none"
                          id="org-post-images-mobile"
                        />
                        <Button
                          as="div"
                          size="sm"
                          variant="outline"
                          leftIcon={<AddIcon />}
                          cursor="pointer"
                          w="full"
                        >
                          Add Photos
                        </Button>
                      </Box>
                      <Button colorScheme="teal" size="sm" onClick={handleCreatePost} isLoading={posting} flex={1}>Publish</Button>
                    </HStack>

                    {/* File Input - Desktop: Enhanced layout */}
                    <VStack spacing={3} w="full" display={{ base: 'none', md: 'flex' }}>
                      <Box as="label" htmlFor="org-post-images-desktop" w="full" cursor="pointer">
                        <Input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleImageSelect}
                          display="none"
                          id="org-post-images-desktop"
                        />
                        <Button
                          as="div"
                          size="sm"
                          variant="outline"
                          leftIcon={<AddIcon />}
                          cursor="pointer"
                        >
                          Add Photos
                        </Button>
                      </Box>
                      <HStack justify="space-between" w="full">
                        <Text fontSize="xs" color="gray.500">Posts are visible to members in org feed and on your public profile.</Text>
                        <Button colorScheme="teal" size="sm" onClick={handleCreatePost} isLoading={posting}>Publish</Button>
                      </HStack>
                    </VStack>
                  </VStack>
                </Box>

                <Divider />

                {feedPosts.length === 0 ? <Text color="gray.500" fontSize={{ base: 'xs', md: 'sm' }}>No posts yet.</Text> : null}
                {feedPosts.map((post) => (
                  <Box key={post.id} borderWidth="1px" borderColor="gray.200" borderRadius={{ base: 'md', md: 'lg' }} p={{ base: 2.5, md: 4 }} bg="white" transition="all 0.2s" _hover={{ boxShadow: { base: 'none', md: '0 4px 12px rgba(0,0,0,0.1)' }, borderColor: { base: 'gray.200', md: 'gray.300' } }}>
                    <VStack align="stretch" spacing={{ base: 2, md: 3 }}>
                      <HStack justify="space-between" spacing={2} wrap="wrap">
                        <HStack spacing={2} minW={0} flex={1}>
                          <Avatar size={{ base: 'xs', md: 'sm' }} src={post.author_profile_picture ? getImageUrl(post.author_profile_picture) : undefined} name={post.author_name} />
                          <VStack spacing={0} align="start" minW={0} flex={1}>
                            <Text fontSize={{ base: '11px', md: 'sm' }} fontWeight="600" noOfLines={1}>{post.author_name}</Text>
                            <Badge colorScheme="gray" fontSize={{ base: '9px', md: 'xs' }} noOfLines={1}>{post.category_tag}</Badge>
                          </VStack>
                        </HStack>
                        {post.is_looking_for && <Badge colorScheme="blue" fontSize={{ base: '9px', md: 'xs' }}>🔍 Looking</Badge>}
                      </HStack>
                      <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.700" whiteSpace="pre-wrap" mb={post.images && post.images.length > 0 ? 1 : 0}>{post.content}</Text>

                      {/* Post Images */}
                      {post.images && post.images.length > 0 && (
                        <HStack spacing={1} wrap="wrap" mb={1}>
                          {post.images.map((img: any, idx: number) => (
                            <Image key={idx} src={getImageUrl(img)} alt={`post-${idx}`} w={{ base: '100px', md: '120px' }} h={{ base: '100px', md: '120px' }} objectFit="cover" borderRadius="md" />
                          ))}
                        </HStack>
                      )}

                      {/* Comments Section */}
                      <Box mt={2} pt={2} borderTopWidth="1px" borderColor="gray.200">
                        <Text fontSize={{ base: '10px', md: 'xs' }} fontWeight="600" mb={2}>Comments ({post.comments_count || 0})</Text>

                        {/* Comment Input */}
                        <VStack spacing={1} mb={2}>
                          <Input
                            size={{ base: 'sm', md: 'md' }}
                            placeholder="Add a comment..."
                            value={commentText[post.id] || ''}
                            onChange={(e) => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
                            fontSize={{ base: '12px', md: 'md' }}
                          />
                          <Button
                            w="full"
                            size={{ base: 'xs', md: 'sm' }}
                            colorScheme="teal"
                            variant="outline"
                            onClick={() => handleAddComment(post.id)}
                            isDisabled={!commentText[post.id]?.trim()}
                            fontSize={{ base: '12px', md: 'md' }}
                          >
                            Reply
                          </Button>
                        </VStack>

                        {/* Existing Comments */}
                        {postComments[post.id] && postComments[post.id].length > 0 && (
                          <VStack align="stretch" spacing={1}>
                            {postComments[post.id].map((comment: any) => (
                              <Box key={comment.id} p={2} bg="gray.50" borderRadius="sm">
                                <HStack spacing={1} mb={1} wrap="wrap">
                                  <Avatar size="xs" name={comment.author_name} />
                                  <Text fontSize={{ base: '10px', md: 'xs' }} fontWeight="600" noOfLines={1}>{comment.author_name}</Text>
                                </HStack>
                                <Text fontSize={{ base: '11px', md: 'xs' }} color="gray.700">{comment.content}</Text>
                              </Box>
                            ))}
                          </VStack>
                        )}
                      </Box>
                    </VStack>
                  </Box>
                ))}
              </VStack>
            ) : (
              <Text color="gray.500" fontSize={{ base: 'xs', md: 'sm' }}>Only approved members can view and interact with this feed.</Text>
            )}
          </Box>
        ) : null}

        {communityOrg && isCreator ? (
          <Box bg="white" borderWidth={{ base: 0, md: '1px' }} borderColor="gray.200" borderRadius={{ base: 0, md: 'xl' }} p={{ base: 3, md: 6 }} boxShadow={{ base: 'none', md: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <Heading size={{ base: 'sm', md: 'lg' }} mb={{ base: 4, md: 6 }} color="gray.900">📦 Trade Feed</Heading>
            {tradeFeedLoading ? (
              <Spinner size="sm" />
            ) : tradeFeedProducts.length === 0 ? (
              <Text color="gray.500" fontSize={{ base: 'xs', md: 'sm' }}>No products in trade feed yet.</Text>
            ) : (
              <Box display="grid" gridTemplateColumns={{ base: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }} gap={{ base: 3, md: 4 }}>
                {tradeFeedProducts.map((product: any) => {
                  const imageUrls = typeof product.image_urls === 'string' ? 
                    (product.image_urls.startsWith('[') ? JSON.parse(product.image_urls) : [product.image_urls]) 
                    : product.image_urls || []
                  const firstImage = Array.isArray(imageUrls) ? imageUrls[0] : imageUrls
                  return (
                    <Box key={product.product_id} borderWidth="1px" borderColor="gray.200" borderRadius="md" overflow="hidden" transition="all 0.2s" _hover={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderColor: 'teal.300' }}>
                      <Link as={RouterLink} to={`/products/${product.product_id}`} _hover={{ textDecoration: 'none' }}>
                        <Box h="160px" bg="gray.100" overflow="hidden" cursor="pointer">
                          {firstImage ? (
                            <Image src={getImageUrl(firstImage)} alt={product.title} w="full" h="full" objectFit="cover" _hover={{ transform: 'scale(1.05)', transition: 'transform 0.2s' }} />
                          ) : (
                            <Box w="full" h="full" display="flex" alignItems="center" justifyContent="center" bg="gray.200">
                              <Text fontSize="xs" color="gray.500">No Image</Text>
                            </Box>
                          )}
                        </Box>
                        <Box p={3}>
                          <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="600" noOfLines={2} mb={1} _hover={{ color: 'teal.600' }}>{product.title}</Text>
                          <Text fontSize={{ base: '10px', md: 'xs' }} color="gray.500" noOfLines={1} mb={2}>{product.category}</Text>
                          <HStack justify="space-between">
                            <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="700" color="teal.600">₱{product.price}</Text>
                            <Badge colorScheme="blue" fontSize={{ base: '10px', md: 'xs' }}>{product.status}</Badge>
                          </HStack>
                        </Box>
                      </Link>
                    </Box>
                  )
                })}
              </Box>
            )}
          </Box>
        ) : null}

        {communityOrg && isCreator ? (
          <Box bg="white" borderWidth={{ base: 0, md: '1px' }} borderColor="gray.200" borderRadius={{ base: 0, md: 'xl' }} p={{ base: 3, md: 6 }} boxShadow={{ base: 'none', md: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <Heading size={{ base: 'sm', md: 'lg' }} mb={{ base: 4, md: 6 }} color="gray.900">🔐 Admin Controls</Heading>
            {adminLoading ? <Spinner size="sm" /> : (
              <VStack align="stretch" spacing={{ base: 3, md: 8 }}>
                {/* Desktop Grid Layout */}
                <Box display={{ base: 'none', md: 'grid' }} gridTemplateColumns="1fr 1fr" gap={8}>
                  {/* Pending Requests */}
                  <Box>
                    <Text fontSize="md" fontWeight="700" mb={4} color="gray.900">Pending Join Requests ({joinRequests.length})</Text>
                    {joinRequests.length === 0 ? <Text fontSize="sm" color="gray.500">No pending requests.</Text> : null}
                    <VStack align="stretch" spacing={3}>
                      {joinRequests.map((request) => (
                        <Box key={request.user_id} borderWidth="1px" borderColor="gray.200" borderRadius="md" p={3} transition="all 0.2s" _hover={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderColor: 'gray.300' }}>
                          <HStack justify="space-between" spacing={2} mb={3} wrap="wrap">
                            <HStack spacing={2} minW={0} flex={1}>
                              <Avatar size="md" src={request.profile_picture ? getImageUrl(request.profile_picture) : undefined} name={request.name} />
                              <VStack align="start" spacing={0} minW={0} flex={1}>
                                <Text fontSize="sm" fontWeight="600" noOfLines={1}>{request.name}</Text>
                                <Text fontSize="xs" color="gray.500" noOfLines={1}>Requested {new Date(request.requested_at).toLocaleString()}</Text>
                              </VStack>
                            </HStack>
                          </HStack>
                          <HStack spacing={2} w="full">
                            <Button flex={1} size="sm" colorScheme="green" onClick={() => handleDecide(request.user_id, 'approve')}>Approve</Button>
                            <Button flex={1} size="sm" colorScheme="red" variant="outline" onClick={() => handleDecide(request.user_id, 'reject')}>Reject</Button>
                          </HStack>
                        </Box>
                      ))}
                    </VStack>
                  </Box>

                  {/* Members List */}
                  <Box>
                    <Text fontSize="md" fontWeight="700" mb={4} color="gray.900">Members ({members.length})</Text>
                    <VStack align="stretch" spacing={3}>
                      {members.map((member) => (
                        <HStack key={member.user_id} justify="space-between" spacing={2} borderWidth="1px" borderColor="gray.200" borderRadius="md" p={3} transition="all 0.2s" _hover={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderColor: 'gray.300' }} wrap="wrap">
                          <HStack spacing={2} minW={0} flex={1}>
                            <Avatar size="md" src={member.profile_picture ? getImageUrl(member.profile_picture) : undefined} name={member.name} />
                            <Text fontSize="sm" fontWeight="600" noOfLines={1}>{member.name}</Text>
                          </HStack>
                          {member.user_id !== user?.id ? <Button size="sm" colorScheme="red" variant="outline" onClick={() => handleRemoveMember(member.user_id)}>Remove</Button> : <Badge colorScheme="purple" fontSize="xs">You</Badge>}
                        </HStack>
                      ))}
                    </VStack>
                  </Box>
                </Box>

                {/* Mobile Stack Layout */}
                <VStack align="stretch" spacing={{ base: 3, md: 5 }} display={{ base: 'flex', md: 'none' }}>
                <Box>
                  <Text fontSize={{ base: 'xs', md: 'sm' }} fontWeight="600" mb={3}>Pending join requests ({joinRequests.length})</Text>
                  {joinRequests.length === 0 ? <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.500">No pending requests.</Text> : null}
                  <VStack align="stretch" spacing={2}>
                    {joinRequests.map((request) => (
                      <Box key={request.user_id} borderWidth="1px" borderColor="gray.200" borderRadius="md" p={2}>
                        <HStack justify="space-between" spacing={2} mb={2} wrap="wrap">
                          <HStack spacing={2} minW={0} flex={1}>
                            <Avatar size={{ base: 'sm', md: 'md' }} src={request.profile_picture ? getImageUrl(request.profile_picture) : undefined} name={request.name} />
                            <VStack align="start" spacing={0} minW={0} flex={1}>
                              <Text fontSize={{ base: 'xs', md: 'sm' }} fontWeight="600" noOfLines={1}>{request.name}</Text>
                              <Text fontSize={{ base: '10px', md: 'xs' }} color="gray.500" noOfLines={1}>Requested {new Date(request.requested_at).toLocaleString()}</Text>
                            </VStack>
                          </HStack>
                        </HStack>
                        <HStack spacing={2} w="full">
                          <Button flex={1} size={{ base: 'xs', md: 'sm' }} colorScheme="green" onClick={() => handleDecide(request.user_id, 'approve')}>Approve</Button>
                          <Button flex={1} size={{ base: 'xs', md: 'sm' }} colorScheme="red" variant="outline" onClick={() => handleDecide(request.user_id, 'reject')}>Reject</Button>
                        </HStack>
                      </Box>
                    ))}
                  </VStack>
                </Box>

                <Divider />

                <Box>
                  <Text fontSize={{ base: 'xs', md: 'sm' }} fontWeight="600" mb={3}>Members ({members.length})</Text>
                  <VStack align="stretch" spacing={2}>
                    {members.map((member) => (
                      <HStack key={member.user_id} justify="space-between" spacing={2} borderWidth="1px" borderColor="gray.200" borderRadius="md" p={2} wrap="wrap">
                        <HStack spacing={2} minW={0} flex={1}>
                          <Avatar size={{ base: 'sm', md: 'md' }} src={member.profile_picture ? getImageUrl(member.profile_picture) : undefined} name={member.name} />
                          <Text fontSize={{ base: 'xs', md: 'sm' }} fontWeight="600" noOfLines={1}>{member.name}</Text>
                        </HStack>
                        {member.user_id !== user?.id ? <Button size={{ base: 'xs', md: 'sm' }} colorScheme="red" variant="outline" onClick={() => handleRemoveMember(member.user_id)}>Remove</Button> : <Badge colorScheme="purple" fontSize={{ base: '10px', md: 'xs' }}>You</Badge>}
                      </HStack>
                    ))}
                  </VStack>
                </Box>
                </VStack>
              </VStack>
            )}
          </Box>
        ) : null}
        </VStack>
      </Container>

      {/* Mobile Bottom Navigation */}
      <FloatingTab />
    </Box>
  )
}

export default OrganizationProfile
