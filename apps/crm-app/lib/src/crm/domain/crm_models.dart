enum AccountRole { prospect, customer, supplier, partner }

extension AccountRoleLabel on AccountRole {
  String get label {
    return switch (this) {
      AccountRole.prospect => 'Prospect',
      AccountRole.customer => 'Customer',
      AccountRole.supplier => 'Supplier',
      AccountRole.partner => 'Partner',
    };
  }
}

enum DealStage { discovery, qualified, proposal, won }

extension DealStageLabel on DealStage {
  String get label {
    return switch (this) {
      DealStage.discovery => 'Ny dialog',
      DealStage.qualified => 'Kvalifisert',
      DealStage.proposal => 'Tilbud',
      DealStage.won => 'Vunnet',
    };
  }
}

enum ActivityStatus { open, done }

enum SignalStatus { newSignal, linked, dismissed }

class Account {
  const Account({
    required this.id,
    required this.organizationId,
    required this.orgnr,
    required this.name,
    required this.municipality,
    required this.nace,
    required this.roles,
    required this.owner,
    required this.updatedLabel,
  });

  final String id;
  final String organizationId;
  final String orgnr;
  final String name;
  final String municipality;
  final String nace;
  final List<AccountRole> roles;
  final String owner;
  final String updatedLabel;
}

class Contact {
  const Contact({
    required this.id,
    required this.accountId,
    required this.name,
    required this.title,
    required this.email,
    required this.phone,
    required this.isPrimary,
  });

  final String id;
  final String accountId;
  final String name;
  final String title;
  final String email;
  final String phone;
  final bool isPrimary;
}

class Deal {
  const Deal({
    required this.id,
    required this.accountId,
    required this.title,
    required this.stage,
    required this.valueNok,
    required this.owner,
  });

  final String id;
  final String accountId;
  final String title;
  final DealStage stage;
  final int valueNok;
  final String owner;
}

class Activity {
  const Activity({
    required this.id,
    required this.accountId,
    required this.title,
    required this.type,
    required this.dueLabel,
    required this.status,
  });

  final String id;
  final String accountId;
  final String title;
  final String type;
  final String dueLabel;
  final ActivityStatus status;
}

class Note {
  const Note({
    required this.id,
    required this.accountId,
    required this.author,
    required this.body,
    required this.createdLabel,
  });

  final String id;
  final String accountId;
  final String author;
  final String body;
  final String createdLabel;
}

class CrmSignal {
  const CrmSignal({
    required this.id,
    required this.organizationId,
    required this.orgnr,
    required this.organizationName,
    required this.title,
    required this.reason,
    required this.score,
    required this.observedLabel,
    required this.status,
    this.linkedAccountId,
  });

  final String id;
  final String organizationId;
  final String orgnr;
  final String organizationName;
  final String title;
  final String reason;
  final int score;
  final String observedLabel;
  final SignalStatus status;
  final String? linkedAccountId;

  CrmSignal copyWith({SignalStatus? status, String? linkedAccountId}) {
    return CrmSignal(
      id: id,
      organizationId: organizationId,
      orgnr: orgnr,
      organizationName: organizationName,
      title: title,
      reason: reason,
      score: score,
      observedLabel: observedLabel,
      status: status ?? this.status,
      linkedAccountId: linkedAccountId ?? this.linkedAccountId,
    );
  }
}
