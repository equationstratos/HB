import type {
  AdminAlertsDto,
  AdminGuardDto,
  AdminOverviewDto,
  AdminUserDto,
  AuditLogDto,
  AuditQuery,
  AuthTokens,
  AvailabilityInput,
  CallResponseDto,
  ComputedRoute,
  CreateMissionInput,
  DeviationDto,
  EmergencyContactDto,
  EmergencyContactInput,
  GuardApplicationInput,
  GuardDocumentType,
  GuardListQuery,
  GuardProfileDto,
  LiveMissionDto,
  LocationDto,
  LocationPingInput,
  LoginInput,
  LoginResponse,
  LowRatedGuardDto,
  MessageDto,
  MfaSetupResponse,
  MissionContactsDto,
  MissionDto,
  MissionStatus,
  OfferDto,
  Paginated,
  PlanDto,
  PlanInput,
  PlanUpdateInput,
  PresenceInput,
  RatingDto,
  RatingInput,
  RegisterInput,
  RouteRequestInput,
  SosAlertDto,
  SosInput,
  SubscriptionDto,
  UpdateProfileInput,
  UserDto,
  UserListQuery,
} from '@hb/shared';
import type { Http } from './http';

type Page = { page?: number; pageSize?: number };
type MissionQuery = Page & { status?: MissionStatus[]; from?: string; to?: string };

export interface Candidate {
  guardId: string;
  distanceMeters: number;
  ratingAvg: number | null;
  guard: AdminGuardDto | null;
}

export type AdminSubscriptionDto = SubscriptionDto & { clientId: string; clientName: string };

/** Points d'entrée de l'API, groupés par domaine. */
export function createEndpoints(http: Http) {
  const get = <T>(path: string, query?: object) =>
    http.request<T>('GET', path, { query: query as never });
  const post = <T>(path: string, body?: unknown) =>
    http.request<T>('POST', path, { body: body ?? {} });
  const put = <T>(path: string, body: unknown) => http.request<T>('PUT', path, { body });
  const patch = <T>(path: string, body: unknown) => http.request<T>('PATCH', path, { body });
  const del = <T>(path: string) => http.request<T>('DELETE', path);
  const auth = <T>(path: string, body: unknown) =>
    http.request<T>('POST', path, { body, noRefresh: true });

  return {
    auth: {
      register: (input: RegisterInput) => auth<LoginResponse>('/auth/register', input),
      login: (input: LoginInput) => auth<LoginResponse>('/auth/login', input),
      mfaSetup: (mfaToken: string) => auth<MfaSetupResponse>('/auth/mfa/setup', { mfaToken }),
      mfaEnable: (mfaToken: string, code: string) =>
        auth<LoginResponse>('/auth/mfa/enable', { mfaToken, code }),
      mfaVerify: (mfaToken: string, code: string) =>
        auth<LoginResponse>('/auth/mfa/verify', { mfaToken, code }),
      refresh: (refreshToken?: string) =>
        auth<{ user: UserDto; tokens: AuthTokens }>(
          '/auth/refresh',
          refreshToken ? { refreshToken } : {},
        ),
      logout: (refreshToken?: string) =>
        auth<void>('/auth/logout', refreshToken ? { refreshToken } : {}),
      sendPhoneCode: () => post<{ expiresInSeconds: number }>('/auth/phone/send-code'),
      verifyPhone: (code: string) => post<void>('/auth/phone/verify', { code }),
      selfMfaSetup: () => post<MfaSetupResponse>('/auth/me/mfa/setup'),
      selfMfaEnable: (code: string) => post<void>('/auth/me/mfa/enable', { code }),
    },

    me: {
      get: () => get<UserDto>('/me'),
      update: (input: UpdateProfileInput) => patch<UserDto>('/me', input),
      consent: (location: boolean) => post<UserDto>('/me/consent', { location }),
      setPushToken: (token: string | null) => put<void>('/me/push-token', { token }),
      contacts: () => get<EmergencyContactDto[]>('/me/emergency-contacts'),
      addContact: (input: EmergencyContactInput) =>
        post<EmergencyContactDto>('/me/emergency-contacts', input),
      removeContact: (id: string) => del<void>(`/me/emergency-contacts/${id}`),
    },

    plans: {
      list: () => get<PlanDto[]>('/plans'),
    },

    subscriptions: {
      mine: () => get<{ subscription: SubscriptionDto | null }>('/subscriptions/me'),
      subscribe: (planId: string) => post<SubscriptionDto>('/subscriptions', { planId }),
      cancel: () => post<void>('/subscriptions/me/cancel'),
    },

    routes: {
      preview: (input: RouteRequestInput) => post<ComputedRoute>('/routes/preview', input),
    },

    missions: {
      create: (input: CreateMissionInput) => post<MissionDto>('/missions', input),
      list: (query: MissionQuery = {}) => get<Paginated<MissionDto>>('/missions', query),
      get: (id: string) => get<MissionDto>(`/missions/${id}`),
      setStatus: (id: string, status: 'GUARD_EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED') =>
        post<MissionDto>(`/missions/${id}/status`, { status }),
      cancel: (id: string, reason?: string) =>
        post<MissionDto>(`/missions/${id}/cancel`, { reason }),
      updateRoute: (id: string, input: RouteRequestInput) =>
        put<MissionDto>(`/missions/${id}/route`, input),
      locations: (id: string) => get<LocationDto[]>(`/missions/${id}/locations`),
      sendLocations: (id: string, pings: LocationPingInput[]) =>
        post<{ accepted: number }>(`/missions/${id}/locations`, { pings }),
      messages: (id: string) => get<MessageDto[]>(`/missions/${id}/messages`),
      sendMessage: (id: string, body: string) =>
        post<MessageDto>(`/missions/${id}/messages`, { body }),
      call: (id: string) => post<CallResponseDto>(`/missions/${id}/call`),
      sos: (id: string, input: SosInput = {}) => post<SosAlertDto>(`/missions/${id}/sos`, input),
      sosList: (id: string) => get<SosAlertDto[]>(`/missions/${id}/sos`),
      deviations: (id: string) => get<DeviationDto[]>(`/missions/${id}/deviations`),
      rate: (id: string, input: RatingInput) => post<RatingDto>(`/missions/${id}/rating`, input),
    },

    deviations: {
      answer: (id: string, ok: boolean, note?: string) =>
        post<DeviationDto>(`/deviations/${id}/answer`, { ok, note }),
      acknowledge: (id: string, note?: string) =>
        post<DeviationDto>(`/deviations/${id}/acknowledge`, { note }),
      resolve: (id: string, note?: string) =>
        post<DeviationDto>(`/deviations/${id}/resolve`, { note }),
    },

    sos: {
      acknowledge: (id: string, note?: string) =>
        post<SosAlertDto>(`/sos/${id}/acknowledge`, { note }),
      resolve: (id: string, note?: string) => post<SosAlertDto>(`/sos/${id}/resolve`, { note }),
    },

    offers: {
      list: () => get<OfferDto[]>('/offers'),
      accept: (id: string) => post<{ missionId: string }>(`/offers/${id}/accept`),
      decline: (id: string) => post<void>(`/offers/${id}/decline`),
    },

    guards: {
      me: () => get<GuardProfileDto>('/guards/me'),
      updateProfile: (input: GuardApplicationInput) =>
        put<GuardProfileDto>('/guards/me/profile', input),
      submit: () => post<GuardProfileDto>('/guards/me/submit'),
      /** `file` : Blob (web) ou { uri, name, type } (React Native). */
      uploadDocument: (
        type: GuardDocumentType,
        file: Blob | { uri: string; name: string; type: string },
      ) => {
        const form = new FormData();
        form.append('type', type);
        form.append('file', file as Blob);
        return http.request<GuardProfileDto>('POST', '/guards/me/documents', { body: form });
      },
      deleteDocument: (id: string) => del<void>(`/guards/me/documents/${id}`),
      setAvailability: (input: AvailabilityInput) =>
        put<GuardProfileDto>('/guards/me/availability', input),
      setPresence: (input: PresenceInput) => post<GuardProfileDto>('/guards/me/presence', input),
      ratings: () => get<RatingDto[]>('/guards/me/ratings'),
    },

    admin: {
      overview: () => get<AdminOverviewDto>('/admin/overview'),
      live: () => get<LiveMissionDto[]>('/admin/live'),
      alerts: () => get<AdminAlertsDto>('/admin/alerts'),
      missions: (query: MissionQuery = {}) => get<Paginated<MissionDto>>('/admin/missions', query),
      mission: (id: string) => get<MissionDto>(`/admin/missions/${id}`),
      candidates: (id: string) => get<Candidate[]>(`/admin/missions/${id}/candidates`),
      contacts: (id: string) => get<MissionContactsDto>(`/admin/missions/${id}/contacts`),
      locations: (id: string) => get<LocationDto[]>(`/missions/${id}/locations`),
      messages: (id: string) => get<MessageDto[]>(`/missions/${id}/messages`),
      sendMessage: (id: string, body: string) =>
        post<MessageDto>(`/missions/${id}/messages`, { body }),
      sos: (id: string) => get<SosAlertDto[]>(`/missions/${id}/sos`),
      deviations: (id: string) => get<DeviationDto[]>(`/missions/${id}/deviations`),
      assign: (id: string, guardId: string) =>
        post<MissionDto>(`/admin/missions/${id}/assign`, { guardId }),
      relaunch: (id: string) => post<MissionDto>(`/admin/missions/${id}/relaunch`),
      cancel: (id: string, reason?: string) =>
        post<MissionDto>(`/admin/missions/${id}/cancel`, { reason }),
      guards: (query: Partial<GuardListQuery> = {}) =>
        get<Paginated<AdminGuardDto>>('/admin/guards', query),
      guard: (userId: string) => get<AdminGuardDto>(`/admin/guards/${userId}`),
      approveGuard: (userId: string) => post<AdminGuardDto>(`/admin/guards/${userId}/approve`),
      rejectGuard: (userId: string, reason: string) =>
        post<AdminGuardDto>(`/admin/guards/${userId}/reject`, { reason }),
      suspendGuard: (userId: string, reason: string) =>
        post<AdminGuardDto>(`/admin/guards/${userId}/suspend`, { reason }),
      /** Télécharge une pièce justificative (consultation tracée dans l'audit). */
      document: async (documentId: string): Promise<Blob> => {
        const res = await http.request<Response>('GET', `/admin/guard-documents/${documentId}`, {
          raw: true,
        });
        return res.blob();
      },
      users: (query: Partial<UserListQuery> = {}) =>
        get<Paginated<AdminUserDto>>('/admin/users', query),
      suspendUser: (id: string, reason: string) =>
        post<void>(`/admin/users/${id}/suspend`, { reason }),
      reactivateUser: (id: string) => post<void>(`/admin/users/${id}/reactivate`),
      plans: () => get<PlanDto[]>('/admin/plans'),
      createPlan: (input: PlanInput) => post<PlanDto>('/admin/plans', input),
      updatePlan: (id: string, input: PlanUpdateInput) =>
        patch<PlanDto>(`/admin/plans/${id}`, input),
      subscriptions: (query: Page = {}) =>
        get<Paginated<AdminSubscriptionDto>>('/admin/subscriptions', query),
      lowRated: () => get<LowRatedGuardDto[]>('/admin/ratings/low'),
      audit: (query: Partial<AuditQuery> = {}) =>
        get<Paginated<AuditLogDto>>('/admin/audit', query),
    },
  };
}

export type ApiEndpoints = ReturnType<typeof createEndpoints>;
