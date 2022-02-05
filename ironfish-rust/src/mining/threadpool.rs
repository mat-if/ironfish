use std::sync::mpsc::{self, Receiver, Sender};

use super::thread::Thread;

pub struct ThreadPool {
    threads: Vec<Thread>,
    block_found_receiver: Receiver<usize>,
    mining_request_id: u32,
}
impl ThreadPool {
    pub fn new(thread_count: i32) -> Self {
        assert!(thread_count == -1 || thread_count > 0);

        let count = match thread_count {
            -1 => num_cpus::get(),
            _ => thread_count as usize,
        };

        let (block_found_channel, block_found_receiver): (Sender<usize>, Receiver<usize>) =
            mpsc::channel();

        let mut threads = Vec::with_capacity(count);
        for id in 0..count {
            threads.push(Thread::new(id, block_found_channel.clone(), count));
        }

        ThreadPool {
            threads,
            block_found_receiver,
            mining_request_id: 0,
        }
    }

    pub fn new_work(&mut self, header_bytes: &[u8], target: &[u8], mining_request_id: u32) {
        self.mining_request_id = mining_request_id;

        for thread in self.threads.iter() {
            thread
                .new_work(header_bytes.to_vec(), target.to_vec())
                .unwrap();
        }
    }

    pub fn stop(&self) {
        for thread in self.threads.iter() {
            thread.stop().unwrap();
        }
    }

    pub fn get_found_block(&self) -> Option<(usize, usize)> {
        if let Ok(block) = self.block_found_receiver.try_recv() {
            return Some((block, self.mining_request_id as usize));
        }
        return None;
    }
}
