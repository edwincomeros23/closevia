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

const OrganizationProfile: React.FC = () => {
  const { user } = useAuth()
  const toast = useToast()
  const { handle } = useParams<{ handle: string }>()
  const [org, setOrg] = useState<User | null>(null)
  const [communityOrg, setCommunityOrg] = useState<any | null>(null)
  const [feedPosts, setFeedPosts] = useState<any[]>([])
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
    fetchAdminData()
  }, [communityOrg, fetchFeed, fetchAdminData])

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
    if (!handle || !postContent.trim()) return
    setPosting(true)
    try {
      const formData = new FormData()
      formData.append('content', postContent.trim())
      formData.append('category_tag', postCategoryTag || communityOrg?.category || '')
      formData.append('is_looking_for', postType === 'looking_for' ? 'true' : 'false')
      
      // Append images
      postImages.forEach(file => {
        formData.append('images', file)
      })

      await api.post(`/api/organizations/${handle}/posts`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      setPostContent('')
      setPostType('regular')
      setPostImages([])
      setImagePreviewUrls([])
      setPostCategoryTag('')
      toast({ title: 'Post published', status: 'success' })
      fetchFeed()
    } catch (err: any) {
      toast({ title: 'Failed to publish post', description: err?.response?.data?.error || 'Please try again', status: 'error' })
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
    <Box bg="#FFFDF1" minH="100vh">
      <Container maxW="5xl" py={{ base: 6, md: 10 }}>
        <VStack align="stretch" spacing={6}>
        <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="2xl" overflow="hidden">
          <Box h={{ base: '150px', md: '220px' }} bg="gray.100">
            <Image src={getImageUrl((communityOrg?.cover_url || (org as any)?.org_cover_url || (org as any)?.background_image))} alt="Organization cover" w="full" h="full" objectFit="cover" />
          </Box>

          <Box px={{ base: 4, md: 8 }} pb={{ base: 6, md: 8 }} mt="-48px" position="relative">
            <Box w={{ base: '86px', md: '110px' }} h={{ base: '86px', md: '110px' }} borderRadius="full" overflow="hidden" border="5px solid" borderColor="white" bg="gray.100" mb={4}>
              <Image src={getImageUrl((communityOrg?.logo_url || org?.org_logo_url || org?.profile_picture))} alt={(communityOrg?.name || org?.org_name || org?.name || 'Organization')} w="full" h="full" objectFit="cover" />
            </Box>

            <VStack align="start" spacing={3}>
              <HStack spacing={3} wrap="wrap">
                <Heading size="lg">{communityOrg?.name || org?.org_name || org?.name}</Heading>
                <Badge colorScheme="teal">{communityOrg?.category || (org as any)?.org_category || 'Community'}</Badge>
              </HStack>
              <Text color="gray.500">@{communityOrg?.slug || org?.org_handle || handle}</Text>
              <Text color="gray.700">{communityOrg?.description || org?.bio || 'No description yet.'}</Text>

              <HStack spacing={2} wrap="wrap">
                {(communityOrg?.creator_user_id || org?.id) && !isCreator ? <Button as={RouterLink} to={`/users/${communityOrg?.creator_user_id || org?.id}`} variant="outline" size="sm">View Owner Profile</Button> : null}
                {!user ? <Button as={RouterLink} to="/login" colorScheme="teal" size="sm">Login to Join</Button> : null}
                {user && !isCreator && membershipStatus === 'none' ? <Button colorScheme="teal" size="sm" onClick={handleJoinRequest} isLoading={joinLoading}>Request to Join</Button> : null}
                {user && membershipStatus === 'pending' ? <Badge colorScheme="orange" px={3} py={1} borderRadius="full">Join request pending</Badge> : null}
                {user && membershipStatus === 'approved' ? <Badge colorScheme="green" px={3} py={1} borderRadius="full">Approved member</Badge> : null}
                {isCreator ? <Badge colorScheme="purple" px={3} py={1} borderRadius="full">Creator Admin</Badge> : null}
                {isCreator ? <Button as={RouterLink} to="/organizations/new" size="sm" colorScheme="teal" variant="outline">Create Another Organization</Button> : null}
              </HStack>
            </VStack>
          </Box>
        </Box>

        {communityOrg ? (
          <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="xl" p={4}>
            <Heading size="sm" mb={3}>Organization Feed</Heading>
            {(membershipStatus === 'approved' || isCreator) ? (
              <VStack align="stretch" spacing={4}>
                <Box borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={3}>
                  <VStack align="stretch" spacing={3}>
                    <Text fontSize="sm" fontWeight="600">Create a post</Text>
                    
                    {/* Post Type Selection */}
                    <Select value={postType} onChange={(e) => setPostType(e.target.value as 'regular' | 'looking_for')} size="sm">
                      <option value="regular">📝 Regular Post</option>
                      <option value="looking_for">🔍 Looking for Trade</option>
                    </Select>

                    {postType === 'looking_for' && (
                      <Box p={2} bg="blue.50" borderRadius="md" borderWidth="1px" borderColor="blue.200">
                        <Text fontSize="xs" color="blue.700">💡 Share what items you're looking for in trades with other members</Text>
                      </Box>
                    )}

                    <Input value={postCategoryTag} onChange={(e) => setPostCategoryTag(e.target.value)} placeholder="Category tag (e.g., Cards, Electronics)" size="sm" />
                    <Textarea value={postContent} onChange={(e) => setPostContent(e.target.value)} placeholder={postType === 'looking_for' ? 'Describe what items or trades you\'re looking for...' : 'Share something relevant to this organization'} rows={3} />
                    
                    {/* Image Preview */}
                    {imagePreviewUrls.length > 0 && (
                      <Box>
                        <Text fontSize="xs" fontWeight="600" mb={2}>Attached photos ({imagePreviewUrls.length})</Text>
                        <HStack spacing={2} wrap="wrap">
                          {imagePreviewUrls.map((url, idx) => (
                            <Box key={idx} position="relative" w="80px" h="80px" borderRadius="md" overflow="hidden" borderWidth="1px" borderColor="gray.200">
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

                    {/* File Input */}
                    <Box>
                      <Input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleImageSelect}
                        display="none"
                        id="org-post-images"
                      />
                      <Button
                        as="label"
                        htmlFor="org-post-images"
                        size="sm"
                        variant="outline"
                        leftIcon={<AddIcon />}
                        cursor="pointer"
                      >
                        Add Photos
                      </Button>
                    </Box>

                    <HStack justify="space-between">
                      <Text fontSize="xs" color="gray.500">Posts are visible to members in org feed and on your public profile.</Text>
                      <Button colorScheme="teal" size="sm" onClick={handleCreatePost} isLoading={posting}>Publish</Button>
                    </HStack>
                  </VStack>
                </Box>

                <Divider />

                {feedPosts.length === 0 ? <Text color="gray.500" fontSize="sm">No posts yet.</Text> : null}
                {feedPosts.map((post) => (
                  <Box key={post.id} borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={3}>
                    <HStack justify="space-between" mb={2}>
                      <HStack spacing={2}>
                        <Avatar size="xs" src={post.author_profile_picture ? getImageUrl(post.author_profile_picture) : undefined} name={post.author_name} />
                        <Text fontSize="sm" fontWeight="600">{post.author_name}</Text>
                        <Badge colorScheme="gray">{post.category_tag}</Badge>
                        {post.is_looking_for && <Badge colorScheme="blue">🔍 Looking for</Badge>}
                      </HStack>
                      <Text fontSize="xs" color="gray.500">{new Date(post.created_at).toLocaleString()}</Text>
                    </HStack>
                    <Text fontSize="sm" color="gray.700" whiteSpace="pre-wrap" mb={post.images && post.images.length > 0 ? 2 : 0}>{post.content}</Text>
                    
                    {/* Post Images */}
                    {post.images && post.images.length > 0 && (
                      <HStack spacing={2} wrap="wrap" mb={3}>
                        {post.images.map((img: any, idx: number) => (
                          <Image key={idx} src={getImageUrl(img)} alt={`post-${idx}`} w="120px" h="120px" objectFit="cover" borderRadius="md" />
                        ))}
                      </HStack>
                    )}

                    {/* Comments Section */}
                    <Box mt={3} pt={3} borderTopWidth="1px" borderColor="gray.200">
                      <Text fontSize="xs" fontWeight="600" mb={2}>Comments ({post.comments_count || 0})</Text>
                      
                      {/* Comment Input */}
                      <HStack spacing={2} mb={2}>
                        <Input
                          size="sm"
                          placeholder="Add a comment..."
                          value={commentText[post.id] || ''}
                          onChange={(e) => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          colorScheme="teal"
                          variant="outline"
                          onClick={() => handleAddComment(post.id)}
                          isDisabled={!commentText[post.id]?.trim()}
                        >
                          Reply
                        </Button>
                      </HStack>

                      {/* Existing Comments */}
                      {postComments[post.id] && postComments[post.id].length > 0 && (
                        <VStack align="stretch" spacing={1}>
                          {postComments[post.id].map((comment: any) => (
                            <Box key={comment.id} p={2} bg="gray.50" borderRadius="md">
                              <HStack spacing={2} mb={1}>
                                <Avatar size="xs" name={comment.author_name} />
                                <Text fontSize="xs" fontWeight="600">{comment.author_name}</Text>
                                <Text fontSize="xs" color="gray.500">{new Date(comment.created_at).toLocaleString()}</Text>
                              </HStack>
                              <Text fontSize="xs" color="gray.700">{comment.content}</Text>
                            </Box>
                          ))}
                        </VStack>
                      )}
                    </Box>
                  </Box>
                ))}
              </VStack>
            ) : (
              <Text color="gray.500" fontSize="sm">Only approved members can view and interact with this feed.</Text>
            )}
          </Box>
        ) : null}

        {communityOrg && isCreator ? (
          <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="xl" p={4}>
            <Heading size="sm" mb={4}>Admin Controls</Heading>
            {adminLoading ? <Spinner size="sm" /> : (
              <VStack align="stretch" spacing={5}>
                <Box>
                  <Text fontSize="sm" fontWeight="600" mb={2}>Pending join requests ({joinRequests.length})</Text>
                  {joinRequests.length === 0 ? <Text fontSize="sm" color="gray.500">No pending requests.</Text> : null}
                  <VStack align="stretch" spacing={2}>
                    {joinRequests.map((request) => (
                      <HStack key={request.user_id} justify="space-between" borderWidth="1px" borderColor="gray.200" borderRadius="md" p={2}>
                        <HStack>
                          <Avatar size="sm" src={request.profile_picture ? getImageUrl(request.profile_picture) : undefined} name={request.name} />
                          <VStack align="start" spacing={0}>
                            <Text fontSize="sm" fontWeight="600">{request.name}</Text>
                            <Text fontSize="xs" color="gray.500">Requested {new Date(request.requested_at).toLocaleString()}</Text>
                          </VStack>
                        </HStack>
                        <HStack>
                          <Button size="xs" colorScheme="green" onClick={() => handleDecide(request.user_id, 'approve')}>Approve</Button>
                          <Button size="xs" colorScheme="red" variant="outline" onClick={() => handleDecide(request.user_id, 'reject')}>Reject</Button>
                        </HStack>
                      </HStack>
                    ))}
                  </VStack>
                </Box>

                <Divider />

                <Box>
                  <Text fontSize="sm" fontWeight="600" mb={2}>Members ({members.length})</Text>
                  <VStack align="stretch" spacing={2}>
                    {members.map((member) => (
                      <HStack key={member.user_id} justify="space-between" borderWidth="1px" borderColor="gray.200" borderRadius="md" p={2}>
                        <HStack>
                          <Avatar size="sm" src={member.profile_picture ? getImageUrl(member.profile_picture) : undefined} name={member.name} />
                          <Text fontSize="sm" fontWeight="600">{member.name}</Text>
                        </HStack>
                        {member.user_id !== user?.id ? <Button size="xs" colorScheme="red" variant="outline" onClick={() => handleRemoveMember(member.user_id)}>Remove</Button> : <Badge colorScheme="purple">You</Badge>}
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              </VStack>
            )}
          </Box>
        ) : null}
        </VStack>
      </Container>
    </Box>
  )
}

export default OrganizationProfile
