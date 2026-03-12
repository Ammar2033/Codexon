import Docker from 'dockerode';
import { logger } from '../logger';

const docker = new Docker();

export interface SandboxConfig {
  enableNetworkIsolation: boolean;
  enableFilesystemRestrictions: boolean;
  cpuLimit: number;
  memoryLimit: string;
  gpuCount: number;
  allowedPaths: string[];
  blockedPaths: string[];
  readonlyRootfs: boolean;
  noNewPrivileges: boolean;
  readOnlyTmpfs: boolean;
}

const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  enableNetworkIsolation: true,
  enableFilesystemRestrictions: true,
  cpuLimit: 4,
  memoryLimit: '8g',
  gpuCount: 0,
  allowedPaths: ['/app'],
  blockedPaths: ['/proc', '/sys', '/dev', '/host'],
  readonlyRootfs: true,
  noNewPrivileges: true,
  readOnlyTmpfs: true
};

export function createSandboxHostConfig(config: Partial<SandboxConfig> = {}): Docker.ContainerCreateOptions['HostConfig'] {
  const sandboxConfig = { ...DEFAULT_SANDBOX_CONFIG, ...config };
  
  const hostConfig: Docker.ContainerCreateOptions['HostConfig'] = {
    Memory: parseMemory(sandboxConfig.memoryLimit),
    NanoCpus: sandboxConfig.cpuLimit * 1e9,
    MemorySwap: parseMemory(sandboxConfig.memoryLimit),
    PidsLimit: 512,
    RestartPolicy: { Name: 'unless-stopped' },
    SecurityOpt: [
      'no-new-privileges:true',
      sandboxConfig.readonlyRootfs ? 'readonly-rootfs:true' : '',
      'apparmor:codexon-model'
    ].filter(Boolean),
    CapDrop: ['ALL'],
    Init: true,
    Sysctls: {
      'net.ipv4.ping_group_range': '0 0',
      'kernel.dmesg_restrict': '1',
      'kernel.kptr_restrict': '2'
    },
    ResourceRequirements: sandboxConfig.gpuCount > 0 ? {
      Limits: {
        nvidia: {
          count: sandboxConfig.gpuCount,
          devices: Array.from({ length: sandboxConfig.gpuCount }, (_, i) => ({
            Count: 1,
            DeviceIDs: [String(i)],
            Driver: 'nvidia'
          }))
        }
      }
    } : undefined
  };

  if (sandboxConfig.enableNetworkIsolation) {
    hostConfig.NetworkMode = 'codexon-isolated';
  }

  if (sandboxConfig.readOnlyTmpfs) {
    hostConfig.Tmpfs = {
      '/tmp': 'size=100m,mode=1777',
      '/run': 'size=10m,mode=1777'
    };
  }

  if (sandboxConfig.enableFilesystemRestrictions) {
    hostConfig.Binds = sandboxConfig.allowedPaths.map(p => `${p}:${p}:ro`);
    
    hostConfig.ReadonlyPaths = [
      '/bin',
      '/boot',
      '/dev',
      '/etc',
      '/lib',
      '/lib64',
      '/proc',
      '/root',
      '/run',
      '/sbin',
      '/sys',
      '/usr',
      '/var'
    ];
    
    hostConfig.MaskedPaths = [
      '/proc/kcore',
      '/proc/latency_stats',
      '/proc/timer_list',
      '/proc/timer_stats',
      '/proc/sched_debug',
      '/proc/pressure',
      '/sys/firmware',
      '/sys/devices'
    ];
  }

  return hostConfig;
}

export async function createIsolatedNetwork(): Promise<void> {
  try {
    const networks = await docker.listNetworks({ name: 'codexon-isolated' });
    
    if (networks.length === 0) {
      await docker.createNetwork({
        Name: 'codexon-isolated',
        Driver: 'bridge',
        Options: {
          'com.docker.network.bridge.name': 'codexon-br',
          'com.docker.network.bridge.enable_ip_masquerade': 'true'
        },
        IPAM: {
          Config: [{
            Subnet: '172.28.0.0/16'
          }]
        }
      });
      logger.info('Created isolated network for containers');
    }
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to create isolated network');
  }
}

export function getAppArmorProfile(): string {
  return `
name codexon-model
profile codexon-model {
  #include <abstractions/base>
  
  # Deny all capability requests
  deny capability,
  
  # Deny file creation and writes except /app
  deny /** w,
  allow /app/** rw,
  allow /tmp/** rw,
  allow /run/** rw,
  
  # Deny network except explicit rules
  deny network,
  allow network inet stream,
  allow network inet dgram,
  
  # Deny process operations
  deny ptrace (trace) by peer,
  deny signal,
  
  # Deny mount operations
  deny mount,
  deny umount,
  
  # Allow read-only /proc entries
  allow /proc/cpuinfo r,
  allow /proc/meminfo r,
  allow /proc/stat r,
}
`;
}

export function getSeccompProfile(): string {
  return {
    defaultAction: 'SCMP_ACT_ERRNO',
    syscalls: [
      {
        names: ['read', 'write', 'open', 'close', 'stat', 'lstat', 'fstat', 'poll', 'lseek', 'readv', 'writev', 'brk', 'rt_sigaction', 'rt_sigprocmask', 'ioctl', 'pread64', 'pwrite64', 'readlink', 'mmap', 'mprotect', 'munmap', 'madvise', 'shmget', 'shmat', 'shmctl', 'dup', 'dup2', 'pause', 'nanosleep', 'getitimer', 'alarm', 'setitimer', 'getpid', 'socket', 'connect', 'accept', 'sendto', 'recvfrom', 'sendmsg', 'recvmsg', 'shutdown', 'bind', 'listen', 'getsockname', 'getpeername', 'socketpair', 'setsockopt', 'getsockopt', 'clone', 'fork', 'vfork', 'execve', 'exit', 'wait4', 'kill', 'uname', 'semget', 'semop', 'semctl', 'shmdt', 'msgget', 'msgsnd', 'msgrcv', 'msgctl', 'fcntl', 'flock', 'fsync', 'fdatasync', 'truncate', 'ftruncate', 'getdents', 'getcwd', 'chdir', 'fchdir', 'rename', 'mkdir', 'rmdir', 'creat', 'link', 'unlink', 'symlink', 'readlink', 'chmod', 'fchmod', 'chown', 'fchown', 'lchown', 'umask', 'gettimeofday', 'getrlimit', 'getrusage', 'sysinfo', 'times', 'ptrace', 'getuid', 'syslog', 'getgid', 'setuid', 'setgid', 'geteuid', 'getegid', 'setpgid', 'getppid', 'getpgrp', 'setsid', 'setreuid', 'setregid', 'getgroups', 'setgroups', 'setresuid', 'getresuid', 'setresgid', 'getresgid', 'getpgid', 'setfsuid', 'setfsgid', 'getsid', 'capget', 'capset', 'rt_sigpending', 'rt_sigtimedwait', 'rt_sigqueueinfo', 'rt_sigsuspend', 'sigaltstack', 'utime', 'mknod', 'uselib', 'personality', 'ustat', 'statfs', 'fstatfs', 'sysfs', 'getpriority', 'setpriority', 'sched_setparam', 'sched_getparam', 'sched_setscheduler', 'sched_getscheduler', 'sched_get_priority_max', 'sched_get_priority_min', 'sched_rr_get_interval', 'mlock', 'munlock', 'mlockall', 'munlockall', 'vhangup', 'modify_ldt', 'pivot_root', 'prctl', 'arch_prctl', 'adjtimex', 'setrlimit', 'chroot', 'sync', 'acct', 'settimeofday', 'mount', 'umount2', 'swapon', 'swapoff', 'reboot', 'setdomainname', 'init_module', 'delete_module', 'quotactl', 'gettid', 'readahead', 'setxattr', 'lsetxattr', 'fsetxattr', 'getxattr', 'lgetxattr', 'fgetxattr', 'listxattr', 'llistxattr', 'flistxattr', 'removexattr', 'lremovexattr', 'fremovexattr', 'tkill', 'time', 'futex', 'sched_setaffinity', 'sched_getaffinity', 'io_setup', 'io_destroy', 'io_getevents', 'io_submit', 'io_cancel', 'lookup_dcookie', 'epoll_create', 'remap_file_pages', 'set_tid_address', 'timer_create', 'timer_settime', 'timer_gettime', 'timer_getoverrun', 'timer_delete', 'clock_settime', 'clock_gettime', 'clock_getres', 'clock_nanosleep', 'exit_group', 'epoll_wait', 'epoll_ctl', 'tgkill', 'utimes', 'mbind', 'set_mempolicy', 'get_mempolicy', 'mq_open', 'mq_unlink', 'mq_timedsend', 'mq_timedreceive', 'mq_notify', 'mq_getsetattr', 'kexec_load', 'waitid', 'add_key', 'request_key', 'keyctl', 'ioprio_set', 'ioprio_get', 'inotify_init', 'inotify_add_watch', 'inotify_rm_watch', 'migrate_pages', 'openat', 'mkdirat', 'mknodat', 'fchownat', 'futimesat', 'newfstatat', 'unlinkat', 'renameat', 'linkat', 'symlinkat', 'readlinkat', 'fchmodat', 'faccessat', 'pselect6', 'ppoll', 'unshare', 'splice', 'tee', 'sync_file_range', 'vmsplice', 'move_pages', 'utimensat', 'epoll_pwait', 'signalfd', 'timerfd_create', 'eventfd', 'fallocate', 'timerfd_settime', 'timerfd_gettime', 'accept4', 'signalfd4', 'eventfd2', 'epoll_create1', 'dup3', 'pipe2', 'inotify_init1', 'preadv2', 'pwritev2', 'rt_tgsigqueueinfo', 'perf_event_open', 'recvmmsg', 'fanotify_init', 'fanotify_mark', 'prlimit64', 'name_to_handle_at', 'open_by_handle_at', 'clock_adjtime', 'syncfs', 'sendmmsg', 'setns', 'getcpu', 'process_vm_readv', 'process_vm_writev'],
        action: 'SCMP_ACT_ALLOW'
      },
      {
        names: ['reboot', 'init_module', 'delete_module', 'kexec_load', 'swapon', 'swapoff', 'mount', 'umount2', 'chroot', 'pivot_root'],
        action: 'SCMP_ACT_ERRNO'
      }
    ]
  };
}

function parseMemory(mem: string): number {
  const match = mem.match(/^(\d+)([gm]?)$/i);
  if (!match) return 8 * 1024 * 1024 * 1024;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'g') return value * 1024 * 1024 * 1024;
  if (unit === 'm') return value * 1024 * 1024;
  return value;
}

export async function validateContainerSandbox(containerId: string): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const issues: string[] = [];
  
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    
    if (!info.Config.SecurityOpt?.includes('no-new-privileges')) {
      issues.push('Missing no-new-privileges security option');
    }
    
    if (info.HostConfig.Memory === undefined) {
      issues.push('No memory limit set');
    }
    
    if (info.HostConfig.NanoCpus === undefined) {
      issues.push('No CPU limit set');
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  } catch (error) {
    return {
      valid: false,
      issues: [(error as Error).message]
    };
  }
}