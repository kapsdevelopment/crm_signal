import 'dart:convert';

import 'package:http/http.dart' as http;

import '../application/crm_repositories.dart';
import '../domain/crm_models.dart';

typedef JsonMap = Map<String, Object?>;

class CrmApiException implements Exception {
  const CrmApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() {
    final code = statusCode == null ? '' : ' ($statusCode)';
    return 'CrmApiException$code: $message';
  }
}

class CrmApiClient {
  CrmApiClient({
    required this.baseUrl,
    required this.tenantSlug,
    http.Client? httpClient,
  }) : _httpClient = httpClient ?? http.Client(),
       _ownsClient = httpClient == null;

  final Uri baseUrl;
  final String tenantSlug;
  final http.Client _httpClient;
  final bool _ownsClient;

  Future<List<JsonMap>> listAccounts() {
    return _getList('/crm/accounts');
  }

  Future<JsonMap> getAccount(String accountId) {
    return _getObject('/crm/accounts/$accountId');
  }

  Future<List<JsonMap>> listSignals() {
    return _getList('/crm/signals');
  }

  Future<JsonMap> createAccountFromSignal(String signalId) {
    return _postObject('/crm/accounts/from-signal', {'signalId': signalId});
  }

  void close() {
    if (_ownsClient) {
      _httpClient.close();
    }
  }

  Future<List<JsonMap>> _getList(String path) async {
    final response = await _httpClient.get(_uri(path), headers: _headers);
    final payload = _decodeResponse(response);
    final data = _data(payload);

    if (data is List) {
      return data.map(_asJsonMap).toList();
    }

    throw const CrmApiException('Expected list response from CRM API.');
  }

  Future<JsonMap> _getObject(String path) async {
    final response = await _httpClient.get(_uri(path), headers: _headers);
    final payload = _decodeResponse(response);
    return _asJsonMap(_data(payload));
  }

  Future<JsonMap> _postObject(String path, JsonMap body) async {
    final response = await _httpClient.post(
      _uri(path),
      headers: {..._headers, 'content-type': 'application/json'},
      body: jsonEncode(body),
    );
    final payload = _decodeResponse(response);
    return _asJsonMap(_data(payload));
  }

  Uri _uri(String path) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    final basePath = baseUrl.path.endsWith('/')
        ? baseUrl.path.substring(0, baseUrl.path.length - 1)
        : baseUrl.path;
    return baseUrl.replace(path: '$basePath$normalizedPath');
  }

  Map<String, String> get _headers => {'x-tenant-slug': tenantSlug};

  Object? _decodeResponse(http.Response response) {
    Object? payload;
    try {
      payload = response.body.isEmpty ? null : jsonDecode(response.body);
    } catch (_) {
      throw CrmApiException(
        'CRM API returned invalid JSON.',
        statusCode: response.statusCode,
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw CrmApiException(
        _errorMessage(payload) ?? 'CRM API request failed.',
        statusCode: response.statusCode,
      );
    }

    return payload;
  }

  Object? _data(Object? payload) {
    final map = _asJsonMap(payload);
    if (!map.containsKey('data')) {
      throw const CrmApiException('CRM API response is missing data.');
    }
    return map['data'];
  }

  String? _errorMessage(Object? payload) {
    if (payload is! Map) {
      return null;
    }

    final error = payload['error'];
    if (error is! Map) {
      return null;
    }

    final message = error['message'];
    return message is String ? message : null;
  }
}

class ApiCrmStore implements CrmWorkspaceStore {
  ApiCrmStore({required this.client});

  final CrmApiClient client;

  List<Account> _accounts = [];
  List<Contact> _contacts = [];
  List<Deal> _deals = [];
  List<Activity> _activities = [];
  List<Note> _notes = [];
  List<CrmSignal> _signals = [];
  Map<String, List<CrmSignal>> _signalsByAccountId = {};

  @override
  List<Account> get accounts => List.unmodifiable(_accounts);

  @override
  List<Contact> get contacts => List.unmodifiable(_contacts);

  @override
  List<Deal> get deals => List.unmodifiable(_deals);

  @override
  List<Activity> get activities => List.unmodifiable(_activities);

  @override
  List<Note> get notes => List.unmodifiable(_notes);

  @override
  List<CrmSignal> get signals => List.unmodifiable(_signals);

  @override
  Future<void> load() async {
    final accountSummaries = await client.listAccounts();
    final details = <JsonMap>[];

    for (final account in accountSummaries) {
      details.add(await client.getAccount(_string(account, 'id')));
    }

    _replaceAccountData(details);
    _signals = (await client.listSignals()).map(_signalFromJson).toList();
  }

  @override
  Account? accountById(String id) {
    for (final account in _accounts) {
      if (account.id == id) {
        return account;
      }
    }
    return null;
  }

  @override
  List<Contact> contactsForAccount(String accountId) {
    return _contacts
        .where((contact) => contact.accountId == accountId)
        .toList();
  }

  @override
  List<Deal> dealsForAccount(String accountId) {
    return _deals.where((deal) => deal.accountId == accountId).toList();
  }

  @override
  List<Activity> activitiesForAccount(String accountId) {
    return _activities
        .where((activity) => activity.accountId == accountId)
        .toList();
  }

  @override
  List<Note> notesForAccount(String accountId) {
    return _notes.where((note) => note.accountId == accountId).toList();
  }

  @override
  List<CrmSignal> signalsForAccount(String accountId) {
    return List.unmodifiable(_signalsByAccountId[accountId] ?? const []);
  }

  @override
  Future<Account> createAccountFromSignal(String signalId) async {
    final detail = await client.createAccountFromSignal(signalId);
    final account = _upsertAccountDetail(detail);
    _signals = (await client.listSignals()).map(_signalFromJson).toList();
    return account;
  }

  @override
  void dispose() {
    client.close();
  }

  void _replaceAccountData(List<JsonMap> details) {
    _accounts = details.map(_accountFromJson).toList();
    _contacts = [
      for (final detail in details)
        ..._jsonList(detail, 'contacts').map(
          (contact) => _contactFromJson(detail, contact),
        ),
    ];
    _deals = [
      for (final detail in details)
        ..._jsonList(detail, 'deals').map((deal) => _dealFromJson(detail, deal)),
    ];
    _activities = [
      for (final detail in details)
        ..._jsonList(detail, 'activities').map(
          (activity) => _activityFromJson(detail, activity),
        ),
    ];
    _notes = [
      for (final detail in details)
        ..._jsonList(detail, 'notes').map((note) => _noteFromJson(detail, note)),
    ];
    _signalsByAccountId = {
      for (final detail in details)
        _string(detail, 'id'): _jsonList(
          detail,
          'signals',
        ).map(_signalFromJson).toList(),
    };
  }

  Account _upsertAccountDetail(JsonMap detail) {
    final account = _accountFromJson(detail);
    _accounts = [
      account,
      ..._accounts.where((existing) => existing.id != account.id),
    ];

    final accountId = account.id;
    _contacts = [
      ..._contacts.where((contact) => contact.accountId != accountId),
      ..._jsonList(
        detail,
        'contacts',
      ).map((contact) => _contactFromJson(detail, contact)),
    ];
    _deals = [
      ..._deals.where((deal) => deal.accountId != accountId),
      ..._jsonList(detail, 'deals').map((deal) => _dealFromJson(detail, deal)),
    ];
    _activities = [
      ..._activities.where((activity) => activity.accountId != accountId),
      ..._jsonList(
        detail,
        'activities',
      ).map((activity) => _activityFromJson(detail, activity)),
    ];
    _notes = [
      ..._notes.where((note) => note.accountId != accountId),
      ..._jsonList(detail, 'notes').map((note) => _noteFromJson(detail, note)),
    ];
    _signalsByAccountId = {
      ..._signalsByAccountId,
      accountId: _jsonList(detail, 'signals').map(_signalFromJson).toList(),
    };
    return account;
  }
}

Account _accountFromJson(JsonMap json) {
  final naceCode = _nullableString(json, 'naceCode');
  final naceDescription = _nullableString(json, 'naceDescription');
  return Account(
    id: _string(json, 'id'),
    organizationId: _string(json, 'organizationId'),
    orgnr: _string(json, 'orgnr'),
    name: _string(json, 'name', fallback: 'Ukjent organisasjon'),
    municipality: _nullableString(json, 'municipalityName') ?? 'Ukjent',
    nace: _naceLabel(naceCode, naceDescription),
    roles: _rolesFromJson(json['roles']),
    owner: _nullableString(json, 'ownerName') ?? 'Ufordelt',
    updatedLabel: _relativeLabel(_nullableString(json, 'updatedAt')),
  );
}

Contact _contactFromJson(JsonMap account, JsonMap json) {
  return Contact(
    id: _string(json, 'id'),
    accountId: _string(account, 'id'),
    name: _string(json, 'fullName', fallback: 'Ukjent kontakt'),
    title: _nullableString(json, 'title') ?? 'Kontakt',
    email: _nullableString(json, 'email') ?? '',
    phone: _nullableString(json, 'phone') ?? '',
    isPrimary: _bool(json, 'isPrimary'),
  );
}

Deal _dealFromJson(JsonMap account, JsonMap json) {
  return Deal(
    id: _string(json, 'id'),
    accountId: _string(account, 'id'),
    title: _string(json, 'title', fallback: 'Uten tittel'),
    stage: _dealStage(_string(json, 'stageName')),
    valueNok: _moneyAmount(_nullableString(json, 'valueAmount')),
    owner: _nullableString(json, 'ownerName') ?? 'Ufordelt',
  );
}

Activity _activityFromJson(JsonMap account, JsonMap json) {
  return Activity(
    id: _string(json, 'id'),
    accountId: _string(account, 'id'),
    title: _string(json, 'title', fallback: 'Oppgave uten tittel'),
    type: _activityTypeLabel(_string(json, 'activityType')),
    dueLabel: _dueLabel(_nullableString(json, 'dueAt')),
    status: _string(json, 'status') == 'done'
        ? ActivityStatus.done
        : ActivityStatus.open,
  );
}

Note _noteFromJson(JsonMap account, JsonMap json) {
  return Note(
    id: _string(json, 'id'),
    accountId: _string(account, 'id'),
    author: _nullableString(json, 'authorName') ?? 'Ukjent',
    body: _string(json, 'body'),
    createdLabel: _relativeLabel(_nullableString(json, 'createdAt')),
  );
}

CrmSignal _signalFromJson(JsonMap json) {
  final linkedAccountId = _nullableString(json, 'linkedAccountId');
  return CrmSignal(
    id: _string(json, 'id'),
    organizationId: _string(json, 'organizationId'),
    orgnr: _string(json, 'orgnr'),
    organizationName: _string(json, 'organizationName'),
    title: _string(json, 'title'),
    reason: _string(json, 'reason'),
    score: _int(json, 'score'),
    observedLabel: _relativeLabel(_nullableString(json, 'observedAt')),
    status: _signalStatus(_string(json, 'status'), linkedAccountId),
    linkedAccountId: linkedAccountId,
  );
}

List<AccountRole> _rolesFromJson(Object? value) {
  if (value is! List) {
    return const [AccountRole.prospect];
  }

  final roles = value
      .whereType<String>()
      .map(_accountRole)
      .whereType<AccountRole>()
      .toList();
  return roles.isEmpty ? const [AccountRole.prospect] : roles;
}

AccountRole? _accountRole(String role) {
  return switch (role) {
    'prospect' => AccountRole.prospect,
    'customer' => AccountRole.customer,
    'supplier' => AccountRole.supplier,
    'partner' => AccountRole.partner,
    _ => null,
  };
}

DealStage _dealStage(String stageName) {
  final normalized = stageName.toLowerCase();
  if (normalized.contains('kvalifisert') || normalized.contains('qualified')) {
    return DealStage.qualified;
  }
  if (normalized.contains('tilbud') || normalized.contains('proposal')) {
    return DealStage.proposal;
  }
  if (normalized.contains('vunnet') || normalized.contains('won')) {
    return DealStage.won;
  }
  return DealStage.discovery;
}

SignalStatus _signalStatus(String status, String? linkedAccountId) {
  if (status == 'dismissed') {
    return SignalStatus.dismissed;
  }
  if (status == 'acted_on' || linkedAccountId != null) {
    return SignalStatus.linked;
  }
  return SignalStatus.newSignal;
}

String _activityTypeLabel(String value) {
  return switch (value) {
    'call' => 'Telefon',
    'meeting' => 'Møte',
    'email' => 'E-post',
    'follow_up' => 'Oppgave',
    _ => value.isEmpty ? 'Oppgave' : value,
  };
}

String _naceLabel(String? code, String? description) {
  if (code != null && description != null) {
    return '$code - $description';
  }
  return code ?? description ?? 'Ukjent NACE';
}

int _moneyAmount(String? value) {
  if (value == null) {
    return 0;
  }
  return double.tryParse(value)?.round() ?? 0;
}

String _relativeLabel(String? isoValue) {
  final value = _dateTime(isoValue);
  if (value == null) {
    return 'Ukjent';
  }

  final now = DateTime.now();
  final difference = now.difference(value);
  if (difference.inMinutes < 1) {
    return 'Nå';
  }
  if (difference.inHours < 1) {
    return '${difference.inMinutes} min siden';
  }
  if (difference.inHours < 24) {
    return '${difference.inHours} t siden';
  }
  if (difference.inDays == 1) {
    return 'I går';
  }
  return _dateLabel(value);
}

String _dueLabel(String? isoValue) {
  final value = _dateTime(isoValue);
  if (value == null) {
    return 'Ingen frist';
  }

  final today = DateTime.now();
  final todayDate = DateTime(today.year, today.month, today.day);
  final dueDate = DateTime(value.year, value.month, value.day);
  final days = dueDate.difference(todayDate).inDays;

  if (days == 0) {
    return 'I dag';
  }
  if (days == 1) {
    return 'I morgen';
  }
  return _dateLabel(value);
}

String _dateLabel(DateTime value) {
  final local = value.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = local.month.toString().padLeft(2, '0');
  return '$day.$month.${local.year}';
}

DateTime? _dateTime(String? value) {
  if (value == null || value.isEmpty) {
    return null;
  }
  return DateTime.tryParse(value)?.toLocal();
}

List<JsonMap> _jsonList(JsonMap json, String key) {
  final value = json[key];
  if (value is! List) {
    return const [];
  }
  return value.map(_asJsonMap).toList();
}

JsonMap _asJsonMap(Object? value) {
  if (value is Map) {
    return value.map((key, value) => MapEntry(key.toString(), value));
  }
  throw const CrmApiException('Expected JSON object from CRM API.');
}

String _string(JsonMap json, String key, {String fallback = ''}) {
  final value = json[key];
  return value is String ? value : fallback;
}

String? _nullableString(JsonMap json, String key) {
  final value = json[key];
  if (value is String && value.isNotEmpty) {
    return value;
  }
  return null;
}

bool _bool(JsonMap json, String key) {
  final value = json[key];
  return value is bool && value;
}

int _int(JsonMap json, String key) {
  final value = json[key];
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.round();
  }
  return 0;
}
