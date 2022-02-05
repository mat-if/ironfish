use std::{
    sync::mpsc::{self, Receiver, SendError, Sender},
    thread,
    time::Duration,
};

use super::mine::{self, BATCH_SIZE};

pub(crate) enum Command {
    // TODO Provide a proper struct instead of a tuple?
    NewWork(Vec<u8>, Vec<u8>),
    Stop,
}

pub(crate) struct Thread {
    command_channel: Sender<Command>,
    id: usize,
}
impl Thread {
    pub(crate) fn new(id: usize, block_found_channel: Sender<usize>, pool_size: usize) -> Self {
        let (work_sender, work_receiver): (Sender<Command>, Receiver<Command>) = mpsc::channel();

        thread::Builder::new()
            .name(id.to_string())
            .spawn(move || process_commands(work_receiver, block_found_channel, id, pool_size))
            .unwrap();

        Thread {
            command_channel: work_sender,
            id,
        }
    }

    // TODO: Wrap the errors so we can keep command private
    pub(crate) fn new_work(
        &self,
        header_bytes: Vec<u8>,
        target: Vec<u8>,
    ) -> Result<(), SendError<Command>> {
        self.command_channel
            .send(Command::NewWork(header_bytes, target))
    }

    pub(crate) fn stop(&self) -> Result<(), SendError<Command>> {
        self.command_channel.send(Command::Stop)
    }
}

fn process_commands(
    work_receiver: Receiver<Command>,
    block_found_channel: Sender<usize>,
    start: usize,
    step_size: usize,
) {
    // Wait for first command
    let mut command: Command = work_receiver.recv().unwrap();
    loop {
        match command {
            Command::NewWork(mut header_bytes, target) => {
                println!("New work received!");
                let mut batch_start = start;
                loop {
                    // New command received, stop working so we can process it
                    if let Ok(cmd) = work_receiver.try_recv() {
                        command = cmd;
                        break;
                    }

                    let match_found =
                        mine::mine_batch(&mut header_bytes, &target, batch_start, step_size);
                    if let Some(randomness) = match_found {
                        println!("Found a match in thread.rs. {:?}", randomness);
                        if let Err(e) = block_found_channel.send(randomness) {
                            panic!("Error sending found block: {:?}", e);
                        }

                        // If "stop on match", break here
                    }

                    batch_start += BATCH_SIZE;
                }
            }
            Command::Stop => {
                println!("Stop command received, shutting down.");
                return;
            }
        }
    }
}
